/* =====================================================================
   _lib/migrate-v1.js — CHUYỂN DỮ LIỆU KHÁCH TỪ WEB CHÍNH (v1) SANG KHO v2
   ---------------------------------------------------------------------
   26/11/2026 — nhánh web-v2-promote. Chạy 1 lần do ADMIN kích hoạt
   (act=migrate-v1 trong /api/admin), 2 chế độ:
     · dry=true  (mặc định): ĐỌC nguồn public.* (SELECT thuần, bảng
       whitelist, có LIMIT) + lập BÁO CÁO ĐỐI CHIẾU SỐ LIỆU — KHÔNG ghi.
     · dry=false + confirm:'MIGRATE-V1': thay users/licenses/orders demo
       của BETA bằng dữ liệu thật đã map; merge mốc giá + bank; lưu báo
       cáo + checksum vào st.migrateV1.

   NGUỒN (repo main, production Neon, schema public):
     users · licenses · orders · packages · settings · ratings
     (audit_logs / license_telemetry CHỈ ĐẾM, không chuyển — archival
      nằm nguyên trong DB v1, không mất dữ liệu nào.)

   QUY TẮC AN TOÀN:
     · KHÔNG BAO GIỜ INSERT/UPDATE/DELETE trên public.* — chỉ SELECT.
     · key premium hash-only của v1: giữ keyHash + keyLast4; key FREE
       plaintext giữ nguyên plaintext. KHÔNG tự chế key.
     · idempotent: keyHash/order code đã có trong kho v2 → bỏ qua + đếm.
     · mật khẩu v1 (scrypt 64) giữ ở passV1 — đăng nhập v2 tự nhận và
       tự nâng cấp (xem auth.js).
     · checksum SHA-256 trên dòng license đã sort — chủ shop có thể tự
       chạy lại cùng công thức trên DB v1 để đối chiếu độc lập.
   ===================================================================== */
'use strict';
const C = require('./core.js');
const O = require('./ops.js');
const LC = require('./license-contract.js');
const crypto = require('crypto');

const CAP = {users: 5000, licenses: 20000, orders: 10000, packages: 100, settings: 100};

/* ---------- helper ---------- */
function normDate(v){
  if(v == null) return '';
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}
function toIso(v){
  if(v == null || v === '') return null;
  try{
    const d = new Date(String(v).replace(' ', 'T'));
    return isNaN(d.getTime()) ? String(v) : d.toISOString();
  }catch(e){ return String(v); }
}
function toVnStr(v){
  const iso = toIso(v);
  if(!iso) return C.vnStr();
  try{
    const d = new Date(iso);
    const vn = new Date(d.getTime() + 7 * 3600 * 1000);
    const p = n => String(n).padStart(2, '0');
    return vn.toISOString().slice(0, 10) + ' ' + p(vn.getHours()) + ':' + p(vn.getMinutes());
  }catch(e){ return C.vnStr(); }
}

/* ---------- đọc nguồn (chỉ SELECT, bảng whitelist, có LIMIT) ---------- */
const SRC_SQL = {
  users: 'SELECT id, username, pass_hash, salt, contact, gift_key, created_at, last_login, role, vip FROM public.users ORDER BY id LIMIT ' + CAP.users,
  licenses: 'SELECT id, key, key_hash, key_last4, order_code, package_code, expires_at, status, buyer, fingerprint, server_id, server_changed_at, server_changes, wm, suspicious, created_at, revoked_at FROM public.licenses ORDER BY id LIMIT ' + CAP.licenses,
  orders: 'SELECT id, code, type, buyer_name, buyer_contact, package_code, amount_vnd, note, status, license_id, created_at, decided_at FROM public.orders ORDER BY id LIMIT ' + CAP.orders,
  packages: 'SELECT code, name, days, price_vnd, enabled, sort, sale_price, sale_start, sale_end FROM public.packages ORDER BY sort, code LIMIT ' + CAP.packages,
  settings: 'SELECT key, value FROM public.settings LIMIT ' + CAP.settings,
};
const COUNT_SQL = {
  users: 'SELECT COUNT(*)::int AS n FROM public.users',
  licenses: 'SELECT COUNT(*)::int AS n FROM public.licenses',
  orders: 'SELECT COUNT(*)::int AS n FROM public.orders',
  packages: 'SELECT COUNT(*)::int AS n FROM public.packages',
  ratings: 'SELECT COUNT(*)::int AS n FROM public.ratings',
  audit_logs: 'SELECT COUNT(*)::int AS n FROM public.audit_logs',
  license_telemetry: 'SELECT COUNT(*)::int AS n FROM public.license_telemetry',
};

async function readSource(pg, warnings){
  const src = {};
  for(const [name, sql] of Object.entries(SRC_SQL)){
    const r = await pg.query(sql, []);
    src[name] = r.rows || [];
  }
  const counts = {};
  for(const [name, sql] of Object.entries(COUNT_SQL)){
    try{
      const r = await pg.query(sql, []);
      counts[name] = Number((r.rows[0] && r.rows[0].n) || 0);
    }catch(e){
      counts[name] = -1;
      warnings.push('Không đếm được bảng ' + name + ' (có thể chưa tồn tại): ' + String(e.message).slice(0, 80));
    }
  }
  /* trạng thái theo nhóm (đối chiếu) */
  const groupBy = async (table, col) => {
    try{
      const r = await pg.query('SELECT ' + col + ' AS k, COUNT(*)::int AS n FROM public.' + table + ' GROUP BY ' + col, []);
      const out = {};
      for(const row of (r.rows || [])) out[String(row.k == null ? 'null' : row.k)] = Number(row.n);
      return out;
    }catch(e){ return {err: String(e.message).slice(0, 80)}; }
  };
  const byStatus = {
    licenses: await groupBy('licenses', 'status'),
    orders: await groupBy('orders', 'status'),
  };
  let sumApproved = 0;
  try{
    const r = await pg.query("SELECT COALESCE(SUM(amount_vnd),0)::bigint AS s FROM public.orders WHERE status='approved'", []);
    sumApproved = Number((r.rows[0] && r.rows[0].s) || 0);
  }catch(e){ sumApproved = -1; }
  /* checksum dòng license (sort theo id) — công thức công khai để đối chiếu độc lập:
     sha256( mỗi dòng "id|key_hash|key|expires_at|status" nối '\n' )
     · key placeholder "HASH:..." đếm là rỗng (phía đích lưu null + keyHash riêng)
     · nếu key_hash rỗng mà key plaintext → tính sha256(key) (đúng như mapper/backfill v1)
     hai vế so khớp từng ký tự. */
  const sha256hex = s => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
  let checksum = '';
  try{
    const lines = src.licenses.map(r => {
      const kRaw = r.key == null ? '' : String(r.key);
      const kPlain = /^HASH:/.test(kRaw) ? '' : kRaw;
      const kh = (r.key_hash && String(r.key_hash)) || (kPlain ? sha256hex(kPlain) : '');
      return [r.id, kh, kPlain, normDate(r.expires_at), r.status || ''].join('|');
    });
    checksum = crypto.createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
  }catch(e){ checksum = 'ERR ' + e.message; }
  return {src, counts, byStatus, sumApproved, checksum};
}

/* ---------- mapping ---------- */
function mapPackages(src){
  const pkgs = {};
  for(const p of src.packages){
    pkgs[String(p.code)] = {code: String(p.code), name: String(p.name), days: Number(p.days) || 0,
      price: Number(p.price_vnd) || 0, enabled: Number(p.enabled) === 1};
  }
  /* mốc thời hạn v2: id ổn định theo số ngày; chỉ nhận gói enabled, bỏ freegift
     (web v2 có luồng key FREE riêng DF-) */
  const byDays = {};
  for(const p of src.packages){
    if(String(p.code) === 'freegift') continue;
    if(Number(p.enabled) !== 1) continue;
    const d = Number(p.days) || 0;
    if(byDays[d] == null) byDays[d] = p;   /* trùng số ngày → lấy gói sort trước */
  }
  const order = [30, 90, 180, 365, 0];
  const idFor = {30: 't30', 90: 't90', 180: 't180', 365: 't365', 0: 'tvv'};
  const daysToTier = {};
  const tiers = [];
  for(const d of order){
    const p = byDays[d];
    if(!p) continue;
    const tier = {id: idFor[d], days: d, price: Number(p.price_vnd) || 0, sale: 0, best: false};
    const sp = Number(p.sale_price || 0);
    if(sp > 0){
      tier.salePrice = sp;
      tier.saleStart = toIso(p.sale_start);
      tier.saleEnd = toIso(p.sale_end);
      tier.sale = LC.salePercent(tier, new Date());   /* window đang chạy → nướng % vào; hết giờ → 0 */
    }
    tiers.push(tier);
    daysToTier[d] = tier.id;
  }
  if(tiers.length){
    const bestT = tiers.find(t => t.days === 365) || tiers.reduce((a, b) => (b.days > a.days ? b : a), tiers[0]);
    bestT.best = true;
  }
  return {pkgs, tiers, daysToTier,
    skipped: src.packages.filter(p => String(p.code) === 'freegift' || Number(p.enabled) !== 1).map(p => p.code + (Number(p.enabled) !== 1 ? ' (tắt)' : ''))};
}

function buildContext(src, mapped){
  const ctx = {pkgs: mapped.pkgs, daysToTier: mapped.daysToTier, users: [], giftByUser: {}, ordersByLicId: {}, licByOrderCode: {}};
  for(const u of src.users){
    const vu = {id: 'v1u' + u.id, v1Username: String(u.username).toLowerCase(), v1Contact: String(u.contact || '')};
    ctx.users.push(vu);
    if(u.gift_key) ctx.giftByUser[String(u.gift_key)] = vu.id;
  }
  for(const o of src.orders){
    if(o.license_id != null) ctx.ordersByLicId[Number(o.license_id)] = o;
    ctx.licByOrderCode[String(o.code)] = o;
  }
  return ctx;
}

function mapLicense(row, ctx){
  const keyRaw = row.key == null ? '' : String(row.key);
  const plain = keyRaw && !/^HASH:/.test(keyRaw) ? keyRaw : null;
  const keyHash = row.key_hash ? String(row.key_hash) : (plain ? LC.keyHash(plain) : null);
  const last4 = row.key_last4 ? String(row.key_last4) : (plain ? plain.slice(-4) : null);
  const pkg = ctx.pkgs[String(row.package_code)];
  const days = pkg ? pkg.days : 0;
  const prefix = plain ? (plain.startsWith('FREE-') ? 'FREE' : 'DL') : (String(row.package_code) === 'freegift' ? 'FREE' : 'DL');
  /* gán user: (1) key quà GIFT-<username>; (2) users.gift_key trùng key; (3) đơn liên kết trùng contact/tên */
  let userId = null, linkedHow = '';
  const oc = String(row.order_code || '');
  if(oc.startsWith('GIFT-')){
    const uname = oc.slice(5).toLowerCase();
    const u = ctx.users.find(x => x.v1Username === uname);
    if(u){ userId = u.id; linkedHow = 'gift-register'; }
  }
  if(!userId && plain && ctx.giftByUser[plain]){ userId = ctx.giftByUser[plain]; linkedHow = 'gift-key'; }
  if(!userId){
    const o = ctx.ordersByLicId[Number(row.id)];
    if(o){
      const contact = String(o.buyer_contact || '').toLowerCase();
      const name = String(o.buyer_name || '').toLowerCase();
      const u = ctx.users.find(x => (x.v1Contact && contact && x.v1Contact.toLowerCase() === contact) || (name && x.v1Username === name));
      if(u){ userId = u.id; linkedHow = 'order-contact'; }
    }
  }
  const lic = {
    key: plain,
    keyPlaceholder: plain ? null : keyRaw,          /* "HASH:xxxxxxxxxxxxxxxx" — không bí mật */
    keyHash, keyLast4: last4, keyPrefix: prefix,
    userId, buyer: row.buyer == null ? '' : String(row.buyer),
    package: pkg ? pkg.name : (prefix === 'FREE' ? 'Bản thường (FREE)' : 'PREMIUM'),
    tierId: ctx.daysToTier[days] || null, days,
    expires: normDate(row.expires_at) || null,
    maxServers: days === 0 ? 2 : (days >= 180 ? 2 : 1),
    servers: row.server_id ? [{ip: String(row.server_id), lastSeen: normDate(row.server_changed_at) || toVnStr(row.server_changed_at).slice(0, 10)}] : [],
    serverId: row.server_id == null ? null : String(row.server_id),
    fingerprint: row.fingerprint == null ? null : String(row.fingerprint),
    serverChangedAt: toIso(row.server_changed_at),
    serverChanges: Number(row.server_changes || 0),
    wm: Number(row.wm || 0),
    suspicious: row.suspicious === true,
    v1Status: String(row.status || 'active'),
    revoked: String(row.status) === 'revoked',
    revokedAt: toIso(row.revoked_at),
    orderCode: oc, v1Id: Number(row.id), via: 'v1',
    createdAt: normDate(row.created_at) || '',
    linkedHow
  };
  return lic;
}

function mapOrder(row, ctx){
  const stMap = {pending: 'Chờ xác nhận', approved: 'Đã thanh toán', rejected: 'Đã hủy'};
  const status = stMap[String(row.status)] || 'Chờ xác nhận';
  const pkg = ctx.pkgs[String(row.package_code)];
  const days = pkg ? pkg.days : 0;
  const isLicense = String(row.package_code) !== 'freegift';
  const label = pkg ? pkg.name : String(row.package_code);
  const contact = String(row.buyer_contact || '').toLowerCase();
  const name = String(row.buyer_name || '').toLowerCase();
  const u = ctx.users.find(x => (x.v1Contact && contact && x.v1Contact.toLowerCase() === contact) || (name && x.v1Username === name));
  const licRow = ctx.licByOrderCode[String(row.code)];
  const licKey = licRow ? (licRow.key && !/^HASH:/.test(String(licRow.key)) ? String(licRow.key) : (licRow.key_last4 ? '****' + String(licRow.key_last4) : '—')) : '—';
  return {
    id: String(row.code), userId: u ? u.id : null, username: u ? u.username : String(row.buyer_name || ''),
    package: label,
    items: [{pluginId: isLicense ? 'PL-MAIN' : 'PL-FREE', name: label, kind: isLicense ? 'license' : 'plugin',
      tierId: ctx.daysToTier[days] || null, tierLabel: O.tierLabel(days), days,
      version: '', price: pkg ? pkg.price : Number(row.amount_vnd), sale: 0,
      unit: Number(row.amount_vnd), qty: 1, lineTotal: Number(row.amount_vnd)}],
    subtotal: Number(row.amount_vnd), discount: 0, total: Number(row.amount_vnd),
    method: 'Chuyển khoản (web chính v1)',
    paymentContent: 'DAULA ' + String(row.code),
    status, claimedAt: null, createdAt: toVnStr(row.created_at), date: normDate(row.created_at),
    paidAt: status === 'Đã thanh toán' ? toVnStr(row.decided_at) : null,
    license: licKey, note: row.note == null ? '' : String(row.note),
    fromV1: true, v1Id: Number(row.id), decidedAt: toIso(row.decided_at)
  };
}

function mapBank(srcSettings, st){
  const kv = {};
  for(const r of srcSettings) kv[String(r.key)] = r.value == null ? '' : String(r.value);
  const v1 = {name: kv.bank_name || '', account: kv.bank_account || '', holder: kv.bank_holder || ''};
  const cur = (st.settings || {}).bank || {};
  const v1Seedish = !v1.account || v1.account === '0123456789';
  if(v1Seedish) return {changed: false, reason: 'Web chính vẫn dùng thông tin seed mặc định hoặc chưa cấu hình — GIỮ NGUYÊN bank của v2.'};
  if(cur.isSample === false && cur.account && cur.account !== v1.account){
    return {changed: false, reason: 'v2 đang có tài khoản nhận tiền THẬT khác (' + cur.account + ') — GIỮ NGUYÊN. Thông tin v1: ' + v1.account + ' (' + v1.holder + '). Admin tự đối chiếu tại A-cài đặt ngân hàng.'};
  }
  return {changed: true,
    bank: {bin: cur.bin || '970422', account: v1.account, name: (v1.holder || cur.name || '').toUpperCase(),
      shortName: v1.name || cur.shortName || '', isSample: false},
    note: 'Đã chuyển thông tin nhận tiền từ web chính sang v2.'};
}

/* ---------- checksum phía đích (so với nguồn sau khi map) ---------- */
function targetChecksum(mappedLics){
  const lines = mappedLics.map(l => [l.v1Id, l.keyHash || '', l.key || '', l.expires || '', l.v1Status || ''].join('|'));
  return crypto.createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

/* ---------- báo cáo (dry-run hoặc trước khi commit) ---------- */
function buildReport(src, counts, byStatus, sumApproved, srcChecksum, mapped, ctx, st){
  const existingHashes = new Set((st.licenses || []).map(l => l.keyHash).filter(Boolean));
  const existingOrderIds = new Set((st.orders || []).map(o => String(o.id)));
  const existingUsernames = new Set((st.users || []).map(u => u.username.toLowerCase()));
  const mappedLics = src.licenses.map(r => mapLicense(r, ctx));
  const mappedOrders = src.orders.map(r => mapOrder(r, ctx));
  let licDup = 0, ordDup = 0;
  const licSeen = new Set();
  for(const l of mappedLics){
    if((l.keyHash && existingHashes.has(l.keyHash)) || (l.keyHash && licSeen.has(l.keyHash))){ licDup++; }
    if(l.keyHash) licSeen.add(l.keyHash);
  }
  for(const o of mappedOrders){ if(existingOrderIds.has(String(o.id))) ordDup++; }
  const usernameClash = src.users.filter(u => existingUsernames.has(String(u.username).toLowerCase())).map(u => String(u.username));
  return {
    generatedAt: C.vnStr(),
    dryRun: true,
    source: {
      counts,
      licensesByStatus: byStatus.licenses,
      ordersByStatus: byStatus.orders,
      sumApprovedVnd: sumApproved,
      licensesChecksumSha256: srcChecksum,
      /* công thức đối chiếu độc lập chủ shop có thể tự chạy trên DB v1 (key 'HASH:…' đếm như rỗng):
         SELECT string_agg(id||'|'||coalesce(key_hash,'')||'|'||(CASE WHEN key LIKE 'HASH:%' THEN '' ELSE coalesce(key,'') END)||'|'||coalesce(expires_at::text,'')||'|'||status, E'\n' ORDER BY id) FROM licenses; */
    },
    mapping: {
      users: {src: src.users.length, toAdd: src.users.length - usernameClash.length, mergeWithV2: usernameClash, note: 'username trùng v2 → GỘP (giữ mật khẩu v2, thêm passV1 — cả 2 mật khẩu đều đăng nhập được)'},
      licenses: {src: src.licenses.length, toAdd: mappedLics.length - licDup, duplicateInV2: licDup,
        plaintextKey: mappedLics.filter(l => l.key).length, hashOnlyKey: mappedLics.filter(l => !l.key).length,
        linkedToUser: mappedLics.filter(l => l.userId).length, unlinked: mappedLics.filter(l => !l.userId).length,
        revoked: mappedLics.filter(l => l.revoked).length},
      orders: {src: src.orders.length, toAdd: mappedOrders.length - ordDup, duplicateInV2: ordDup,
        byMappedStatus: mappedOrders.reduce((m, o) => { m[o.status] = (m[o.status] || 0) + 1; return m; }, {})},
      tiers: mapped.tiers,
      tiersSkipped: mapped.skipped,
      bank: mapBank(src.settings, st),
    },
    targetPreviewChecksumSha256: targetChecksum(mappedLics),
    warnings: []
  };
}

/* ---------- áp dụng (commit) ---------- */
function applyCommit(st, src, ctx, mapped, bank, opts){
  const now = C.vnStr();
  /* 1) lưu danh sách sổ demo BETA trước khi thay (giới hạn kích thước) */
  st.v1demoBackup = {
    at: now,
    note: 'Dữ liệu BETA demo trước khi migrate dữ liệu thật từ web chính v1 — không xóa anything khỏi DB, chỉ thu hồi khỏi state hoạt động.',
    users: (st.users || []).filter(u => !(u.fromV1)).slice(0, 50),
    licenses: (st.licenses || []).filter(l => l.via !== 'v1').slice(0, 100),
    orders: (st.orders || []).filter(o => !o.fromV1).slice(0, 100)
  };
  /* 2) users: giữ admin hiện có của v2; xóa user thường demo; thêm/merge user v1 */
  const keptAdmins = (st.users || []).filter(u => u.role === 'admin' && !u.fromV1);
  const keptLicByAdmin = new Set(keptAdmins.map(a => a.id));
  const merged = [], added = [], clashed = [];
  const byUsername = new Map(keptAdmins.map(u => [u.username.toLowerCase(), u]));
  const resultUsers = keptAdmins.slice();
  for(const u of src.users){
    const uname = String(u.username).toLowerCase();
    const exist = byUsername.get(uname);
    if(exist){
      /* GỘP: giữ tài khoản v2 hiện có, thêm passV1 → cả mật khẩu cũ lẫn mới dùng được */
      if(!exist.passV1 && u.pass_hash){ exist.passV1 = {salt: String(u.salt || ''), hash: String(u.pass_hash || '')}; }
      exist.v1Id = Number(u.id);
      exist.vip = exist.vip || Number(u.vip) === 1;
      merged.push(String(u.username));
      continue;
    }
    const nu = {
      id: 'v1u' + u.id,
      username: String(u.username),
      email: String(u.contact || ''),
      role: String(u.role) === 'admin' ? 'admin' : 'user',
      banned: false,
      passHash: '',
      passV1: {salt: String(u.salt || ''), hash: String(u.pass_hash || '')},
      createdAt: normDate(u.created_at) || C.vnDate(),
      points: 0, pointLog: [], balance: 0,
      referralCode: 'DL-V1' + String(u.id).padStart(3, '0'),
      referredBy: null,
      vip: Number(u.vip) === 1,
      giftKey: u.gift_key ? String(u.gift_key) : null,
      twoFA: {enabled: false, secret: ''}, readNotifs: [], avatar: '', displayName: '',
      fromV1: true, v1Id: Number(u.id),
      v1LastLogin: toIso(u.last_login)
    };
    resultUsers.push(nu);
    byUsername.set(uname, nu);
    added.push(nu.username);
  }
  /* 3) licenses: giữ license thuộc admin giữ lại; thêm license v1 chưa có (dedupe keyHash) */
  const keptLics = (st.licenses || []).filter(l => l.userId && keptLicByAdmin.has(l.userId) && l.via !== 'v1');
  const seenHash = new Set(keptLics.map(l => l.keyHash).filter(Boolean));
  const addedLics = [];
  let dupLics = 0;
  for(const row of src.licenses){
    const l = mapLicense(row, ctx);
    /* map lại userId theo user ĐÃ merge */
    if(l.userId){
      const u = resultUsers.find(x => x.id === l.userId);
      if(!u){ l.userId = null; }
    }
    if(l.keyHash && seenHash.has(l.keyHash)){ dupLics++; continue; }
    if(l.keyHash) seenHash.add(l.keyHash);
    addedLics.push(l);
  }
  /* 4) orders: đơn v1 thêm lên ĐẦU danh sách (dedupe theo code); đơn demo không thuộc admin giữ lại bị lưu backup */
  const keepV2Orders = (st.orders || []).filter(o => !o.fromV1 && (o.userId && keptLicByAdmin.has(o.userId)));
  const seenOrder = new Set(keepV2Orders.map(o => String(o.id)));
  const addedOrders = [];
  let dupOrders = 0;
  for(const row of src.orders){
    const o = mapOrder(row, ctx);
    if(o.userId){
      const u = resultUsers.find(x => x.id === o.userId);
      if(u) o.username = u.username; else o.userId = null;
    }
    if(seenOrder.has(String(o.id))){ dupOrders++; continue; }
    seenOrder.add(String(o.id));
    addedOrders.push(o);
  }
  /* 5) gán vào state */
  st.users = resultUsers;
  st.licenses = keptLics.concat(addedLics);
  st.orders = addedOrders.concat(keepV2Orders);
  const S = st.settings = st.settings || {};
  if(mapped.tiers.length) S.licenseTiers = mapped.tiers;
  if(bank && bank.changed && bank.bank) S.bank = bank.bank;
  /* 6) nhật ký migrate */
  st.migrateV1 = {
    at: now,
    sourceCounts: opts.counts,
    users: {merged, added: added.length},
    licenses: {added: addedLics.length, duplicateSkipped: dupLics},
    orders: {added: addedOrders.length, duplicateSkipped: dupOrders},
    tiers: mapped.tiers.map(t => t.id),
    bankChanged: !!(bank && bank.changed),
    licensesChecksumSha256: opts.srcChecksum || ''
  };
  return {
    users: {merged, addedCount: added.length},
    licenses: {added: addedLics.length, duplicateSkipped: dupLics},
    orders: {added: addedOrders.length, duplicateSkipped: dupOrders}
  };
}

module.exports = {readSource, mapPackages, buildContext, mapLicense, mapOrder, mapBank, buildReport, applyCommit, CAP};
