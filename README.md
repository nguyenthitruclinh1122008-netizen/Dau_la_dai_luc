# ⚔ ĐẤU LA ĐẠI LỤC — WEBSITE BÁN KEY (DauLa-Website-Deploy)

Website Next.js 16 deploy lên **Vercel** + database **Neon Postgres** (miễn phí).

| Trang | Đường dẫn | Ai dùng |
|---|---|---|
| 🏠 Trang chủ — Wiki 9 Võ Hồn + tải JAR FREE + thanh đánh giá | `/` | Mọi người |
| 💎 Mua Key — VietQR chuyển khoản / thẻ cào, tra cứu đơn, nhận key, tải jar Premium | `/user` | Khách |
| 🛠 Quản trị — duyệt đơn cấp key, KHÓA KEY, sửa giá, cấu hình ngân hàng, nhật ký | `/admin` | Chủ shop |

> 🔒 Đơn hàng luôn ở trạng thái **"Chờ admin duyệt"** — hệ thống KHÔNG BAO GIỜ tự cấp key.
> 🔒 jar Premium KHÔNG có URL công khai — chỉ khách có đơn đã duyệt mới tải được.
>
> 🔑 **MẬT KHẨU `/admin` của bạn: *(mật khẩu tự chọn riêng — xem file HUONG-DAN-RIENG, KHÔNG ghi vào repo)*** — lưu vào file/dấu trang riêng ngay, đừng để ai đọc được README này sau khi repo thành công khai!

---


## 🛡️ BẢO MẬT v2.3 — Server bản quyền ký vé Ed25519 cho plugin

Từ bản plugin **2.3.0**, hệ thống chuyển sang mô hình **ticket-only** (chuẩn 8–9/10):

1. **Khóa riêng Ed25519 chỉ nằm trên web** (env `LICENSE_SIGNING_KEY`). Plugin chỉ giữ khóa công khai — ai copy được jar cũng **không tự cấp được vé**. Toàn bộ khóa HMAC/chuỗi bí mật/bảng dựng khóa đã xóa khỏi jar.
2. **Premium CHỈ bật khi có VÉ do server ký** (15–60 phút/vé), kèm **grace offline 24–72 giờ** ký sẵn trong vé. Mất mạng quá grace → về Free.
3. **Tính năng Premium nằm trong blob đã ký theo vé**: số Hồn Hoàn tối đa, Võ Hồn premium, Hồn Cốt, toàn bộ số liệu skill — jar + config.yml không còn công thức Premium.
4. **Gắn ID server Minecraft** (world UID): đổi server tối đa `LICENSE_REBIND_LIMIT` (2) lần/30 ngày — nút **🔓 Reset máy** trong /admin mở lại lượt.
5. **Heartbeat 10–30 phút** (mặc định 15, cấu hình `licensing.online.heartbeat-minutes` trong plugin). Thu hồi/hết hạn → server khách **xóa vé + key và về Free** ngay.
6. **HTTPS bắt buộc + pin chứng chỉ** (SPKI SHA-256 — TOFU lưu trong secure.dat của server khách; hỗ trợ pin nhúng build).
7. **URL license cố định trong plugin**: `licensing.online.url` trong config.yml plugin **phải đúng domain nhúng trong jar** (jar 3.16.0 nhúng `dau-la-dai-luc-livid.vercel.app` làm CHÍNH + `dau-la-dailuc.netlify.app` làm PHỤ (build 2026-11-17; RP url cũng trỏ Vercel)). Trống/sai host → chỉ chạy Free.
8. **Key shop mới dạng `DL-XXXX-XXXX-XXXX-XXXX`** — mã tra cứu DB, không nhúng bí mật. Key định dạng cũ (có dấu `.`) bị plugin từ chối.
9. **Jar phát hành sạch**: không `SourceFile`, không số dòng, không `pom.xml`; chuỗi nhạy cảm XOR-mã hóa; chống sửa jar bằng manifest SHA-256 (jar bị vá 1 byte → tự khóa Premium, không crash).

**Biến env mới (Vercel → Settings → Environment Variables — đều có mặc định, không bắt buộc):**

| Env | Mặc định | Ý nghĩa |
|---|---|---|
| `LICENSE_SIGNING_KEY` | khóa đi kèm plugin 2.3.0 | Khóa riêng Ed25519 (PKCS8 base64). **Đổi khóa = phải build lại plugin!** |
| `LICENSE_TICKET_MINUTES` | `30` (15–60) | Tuổi thọ vé cấp cho plugin |
| `LICENSE_GRACE_HOURS` | `48` (24–72) | Grace offline tối đa khi mất mạng |
| `LICENSE_REBIND_LIMIT` | `2` (1–2) | Số lần đổi server/30 ngày |
| `LICENSE_MASTER_KEYS` | 2 key chủ cũ | Key chủ (vé vĩnh viễn, không bind máy) |

**File cấu hình Premium:** `src/lib/premium-profile.json` — số Hồn Hoàn, danh sách Võ Hồn premium, công thức skill, aura. Sửa file này + redeploy là khách dùng cấu hình mới ngay (không cần build lại jar).

## 🛡 PLUGIN v2.2.0 — SERVER BẢN QUYỀN & LỆNH ẨN CHỦ SHOP

Plugin v2.2.0 (2 file jar mới trong `assets/jar/`) nói chuyện với website qua 2 API mới:

| API | Làm gì |
|---|---|
| `POST /api/license/activate` | Plugin gửi `{key, hwid}` → web kiểm key trong DB, **gắn cứng HWID máy chủ** (sai máy → `KEY_GAN_MAY_KHAC`), trả về **phiên ký Ed25519** sống 72h |
| `POST /api/license/heartbeat` | Plugin gọi mỗi **5 phút** — key bị admin **REVOKE** hoặc hết hạn → plugin tự khóa ngay (kill switch từ xa). Trả phiên mới (trượt 72h) để server mất mạng vẫn chạy tiếp |

**Trên server game** — `plugins/DauLaDaiLuc/config.yml` thêm:
```yaml
licensing:
  key: "KEY-CỦA-KHÁCH"
  online:
    url: "https://website-của-bạn.vercel.app"   # domain web bán key
```
Không điền `url` → plugin chạy hoàn toàn OFFLINE như bản cũ (kiểm hạn nhúng trong key).

**Lệnh Ẩn Chủ Shop (cả FREE + PREMIUM)**: `/dl hoangde <KEY CHỦ>` — chỉ bạn biết alias + key.
Mở khóa được: `set/get/luu/tam/off` — sửa config trong game, bỏ qua quyền admin, xem trạng thái anti-tamper.
Sai key quá 5 lần → khóa 10 phút. Jar bị sửa code → cổng tự đóng + Premium tự khóa (không crash).

**Anti-tamper**: plugin tự quét SHA-256 mọi file trong jar so với bảng hash nhúng lúc build.
Sửa 1 byte trong class nào → plugin "đánh dấu hư": Premium tắt lặng lẽ, lệnh ẩn đóng — không crash để chống patch.

**Đổi khóa ký**: đổi `LICENSE_SIGNING_KEY` mà không build lại plugin → activate trả lỗi phiên — nhớ build lại jar nếu đổi!

## PHẦN 1: CHUẨN BỊ (làm 1 lần)

1. Tạo tài khoản **GitHub**: https://github.com → Sign up
2. Tạo tài khoản **Vercel**: https://vercel.com → Sign up with GitHub (nhanh nhất)
3. Tạo tài khoản **Neon**: https://neon.tech → Sign up
4. Cài **Node.js** bản LTS: https://nodejs.org (cần để chạy lệnh git/push)

## PHẦN 2: ĐƯA CODE LÊN GITHUB (theo hướng dẫn kèm theo)

1. Giải nén file `DauLa-Website-Deploy.zip`
2. Mở Terminal / PowerShell / Git Bash **tại thư mục vừa giải nén**, chạy lần lượt:

```bash
git init
git add .
git commit -m "feat: portal mua key & wiki daula dai luc v2.2"
git branch -M main
git remote add origin https://github.com/<tài-khoản-của-bạn>/daula-website.git
git push -u origin main
```

> Trên GitHub đã tạo repo rỗng tên `daula-website` trước khi chạy lệnh cuối
> (github.com → New repository → để trống → Create).

## PHẦN 3: TẠO DATABASE NEON (miễn phí)

1. Đăng nhập https://neon.tech → **New Project**
2. Chọn Region: **Singapore (ap-southeast-1)** (gần Việt Nam nhất)
3. Dashboard → **Connection string** → Copy chuỗi bắt đầu bằng
   `postgresql://daula_owner:...@ep-...neon.tech/neondb?sslmode=require`
4. Chuỗi này chính là **DATABASE_URL** ở phần sau.

## PHẦN 4: DEPLOY LÊN VERCEL + CÀI ENV

1. Vercel → **Add New Project** → chọn repo `daula-website` vừa push → Import
2. Mở mục **Environment Variables**, thêm 4 biến sau:

| Tên biến | Giá trị | Ghi chú |
|---|---|---|
| `DATABASE_URL` | `postgresql://daula_owner:...@ep-...neon.tech/neondb?sslmode=require` | chuỗi Neon vừa copy |
| `APP_SECRET` | *(chuỗi ngẫu nhiên riêng — xem file HUONG-DAN-RIENG nhận cùng bản giao, KHÔNG ghi vào repo)* | dùng ký token đăng nhập — đã sinh sẵn chuỗi riêng, copy nguyên xi |
| `ADMIN_SECRET` | *(mật khẩu tự chọn riêng — xem file HUONG-DAN-RIENG, KHÔNG ghi vào repo)* | mật khẩu đăng nhập `/admin` — **LƯU LẠI RA FILE RIÊNG, KHÔNG CHIA SẺ!** |
| `NODE_ENV` | `production` | giữ nguyên |

3. Bấm nút xanh **Deploy** — chờ khoảng 1 phút là xong.
4. Vercel cấp link chính thức: `https://ten-du-an.vercel.app`

## PHẦN 5: KIỂM TRA HOẠT ĐỘNG (sau khi deploy)

| Kiểm tra | Cách làm | Kỳ vọng |
|---|---|---|
| Trang chủ | Mở `https://ten-du-an.vercel.app/` | Wiki 9 Võ Hồn, nút **TẢI JAR FREE** vàng phát sáng, thanh đánh giá 1-10 (không cần Gmail) |
| Mua key | Vào `/user` → chọn gói → nhập tên + liên hệ → **VietQR** hiện QR đúng số tiền + nội dung là **mã đơn**; hoặc chọn **Thẻ cào** nhập serial/PIN | Đơn tạo xong mã `SLxxxxxx`, trạng thái **"Chờ admin duyệt"** — KHÔNG tự cấp key |
| Duyệt đơn | Vào `/admin` → đăng nhập bằng `ADMIN_SECRET` → tab 🧾 Giao dịch → **✅ Duyệt & cấp key** | Key 24 nhóm xuất hiện, hạn đúng gói (30/90/180/365 ngày; LIFETIME = hạn 2275-12-31 dùng vĩnh viễn) |
| Khách nhận key | Quay lại `/user` → tra cứu mã đơn → thấy KEY → bấm tải jar Premium | Chỉ đơn đã duyệt mới tải được jar Premium |
| Khóa key | `/admin` → tab 🔑 Key đã cấp → **🔒 Khóa key** | verify-key trả `KEY_DA_THU_HOI`, tải Premium bị chặn 403 |

## PHẦN 6: SAU KHI BÁN THẬT

1. Muốn đổi mật khẩu `/admin`: Vercel → Settings → Environment Variables → sửa `ADMIN_SECRET` → Deploy lại.
2. `/admin` → tab 🏦 **Ngân hàng**: điền đúng tên ngân hàng + STK + chủ tài khoản — QR VietQR của khách tự đổi theo.
3. `/admin` → tab 💵 **Gói giá**: sửa giá trực tiếp, khách thấy giá mới lập tức.
4. Plugin kiểm tra key **OFFLINE** (ngày hết hạn nhúng trong key) — server game không cần internet, website sập key vẫn hoạt động; chỉ việc mua mới là cần web.
5. Chạy thử trên máy của bạn trước khi deploy (không cần Neon):
   ```bash
   npm install
   npm run dev        # tự chạy database local trong RAM, mở http://localhost:3000
   ```

## ⚠️ BẢO MẬT

- KHÔNG BAO GIỜ commit file `.env` thật lên GitHub (`.gitignore` đã chặn sẵn).
- `ADMIN_SECRET` là cửa vào web quản trị — giữ như giữ tiền.
- Mọi lần duyệt đơn / khóa key / đăng nhập sai đều được ghi nhật ký (tab 📜 Nhật ký).

## 🆕 v3.0.1 — TELEMETRY ĐỐI CHIẾU JAR (tùy chọn nhưng nên bật)

Sau khi build plugin, console in `BUILD HASHES [Premium]: T=xxx M=yyy`.
Thêm biến env cho web (Vercel → Environment Variables):

| Biến | Giá trị | Ý nghĩa |
|---|---|---|
| `DAULA_BUILD_HASHES` | `T:<sha>,M:<sha>` | heartbeat plugin gửi vân tay jar — lệch = jar bị vá → license tự đánh dấu **nghi vấn** (âm thầm) |
| `LICENSE_WM_SECRET` | chuỗi bí mật bất kỳ |盐 sinh watermark theo key (đổi sau khi đã cấp key sẽ lệch wm — đặt ngay từ đầu) |

Xem nghi vấn: `/api/admin/telemetry?susp=1` (đăng nhập admin) hoặc badge
"⚠ nghi vấn" trong /admin → tab Key. Kẻ crack KHÔNG biết mình bị flag —
response heartbeat không đổi.

Cấp lại key cố định (vd key chủ shop `DL-7KR7-VZAE-KPVW-TQZZ`):
```bash
node scripts/tao-key-chu-shop.mjs   # SHOP_URL + ADMIN_SECRET là đủ
```

---
⚔ Đấu La Đại Lục v3.0.1 · Hỗ trợ khách: discord.gg/uNDvZ38TC
