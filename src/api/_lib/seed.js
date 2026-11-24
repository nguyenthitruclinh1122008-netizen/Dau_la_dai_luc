/* Đấu La Đại Lục — seed dữ liệu ban đầu cho server database */
'use strict';
const C = require('./core.js');

function seedState(){
  const now = C.vnDate();
  const mkUsers = [];
  const rawUsers = [
    {id:'u0', username:'admin', password:'admin123', email:'admin@daula.vn', role:'admin', banned:false, createdAt:'2025-01-01', points:0, pointLog:[], balance:0, referralCode:'DL-ADMIN', referredBy:null},
    {id:'u1', username:'khach1', password:'123456', email:'khach1@gmail.com', role:'user', banned:false, createdAt:'2026-03-12', points:1250,
      pointLog:[{at:'2026-11-21', delta:199, why:'Đơn DH-1042 (+10% giá trị đơn)'},{at:'2026-11-19', delta:499, why:'Đơn DH-1039 (+10% giá trị đơn)'},{at:'2026-11-05', delta:899, why:'Đơn DH-1031 (+10% giá trị đơn)'},{at:'2026-10-30', delta:-500, why:'Đổi lấy mã giảm 10%'}],
      balance:189700, referralCode:'DL-TRUC7', referredBy:null},
    {id:'u2', username:'minhtan', password:'123456', email:'minhtan@outlook.com', role:'user', banned:false, createdAt:'2026-11-18', points:199, pointLog:[{at:'2026-11-18', delta:199, why:'Đơn DH-1043 (+10%)'}], balance:0, referralCode:'DL-TAN3X', referredBy:'khach1'},
    {id:'u3', username:'quocbao', password:'123456', email:'quocbao@yahoo.com', role:'user', banned:true, banReason:'Chia sẻ license key công khai trên group', createdAt:'2026-11-02', points:0, pointLog:[], balance:0, referralCode:'DL-BAO9K', referredBy:'khach1'},
    {id:'u4', username:'thanhngan', password:'123456', email:'thanhngan@gmail.com', role:'user', banned:false, createdAt:'2026-11-19', points:499, pointLog:[{at:'2026-11-19', delta:499, why:'Đơn DH-1044 (+10%)'}], balance:0, referralCode:'DL-NGAN6Q', referredBy:'khach1'},
    {id:'u5', username:'TRUC_LINH', password:'TRUC_LINH', email:'truc.linh@daula.vn', role:'admin', banned:false, createdAt:'2026-11-24', points:0, pointLog:[], balance:0, referralCode:'DL-TRUCL', referredBy:null}
  ];
  for(const u of rawUsers){
    mkUsers.push(Object.assign({}, u, {
      passHash: C.hashPassword(u.password),
      password: undefined,
      twoFA: {enabled:false, secret:''},
      readNotifs: u.id === 'u1' ? ['n1'] : [],
      avatar: ''
    }));
  }
  return {
    rev: 0,
    createdAt: now,
    users: mkUsers,
    sessions: {},
    licenses: [
      {key:'DL-VIP-9F2K-8817', userId:'u1', package:'Vĩnh viễn', tierId:'tvv', days:0, expires:null, maxServers:2, servers:[{ip:'45.12.98.7:25565', lastSeen:'2026-11-22'},{ip:'116.203.5.9:25565', lastSeen:'2026-11-21'}]},
      {key:'DL-VIP-7T4M-5521', userId:'u1', package:'365 ngày', tierId:'t365', days:365, expires:'2026-12-05', maxServers:2, servers:[{ip:'45.12.98.7:25565', lastSeen:'2026-11-23'}]},
      {key:'DL-VIP-1Q8N-7742', userId:'u2', package:'30 ngày', tierId:'t30', days:30, expires:'2026-12-18', maxServers:1, servers:[{ip:'203.113.8.42:25565', lastSeen:'2026-11-22'}]},
      {key:'DL-VIP-3B6H-9033', userId:'u4', package:'180 ngày', tierId:'t180', days:180, expires:'2027-01-15', maxServers:2, servers:[{ip:'14.177.32.5:25565', lastSeen:'2026-11-23'},{ip:'14.177.32.5:25566', lastSeen:'2026-11-23'},{ip:'112.78.9.10:25565', lastSeen:'2026-11-20'}]},
      {key:'DF-FREE-0001', userId:'u3', package:'Bản thử miễn phí', tierId:null, days:0, expires:null, maxServers:1, servers:[]}
    ],
    orders: [
      {id:'DH-1031', userId:'u1', package:'Vĩnh viễn', items:[{pluginId:'PL-MAIN', name:'Đấu La Đại Lục — Plugin bản quyền (Vĩnh viễn)', kind:'license', tierId:'tvv', tierLabel:'Vĩnh viễn', days:0, version:'3.16.9', price:849000, sale:10, unit:764100, qty:1, lineTotal:764100}], subtotal:764100, discount:0, total:764100, method:'Chuyển khoản', status:'Đã thanh toán', paymentContent:'DAULA DH-1031', date:'2026-11-05', license:'DL-VIP-9F2K-8817'},
      {id:'DH-1035', userId:'u3', package:'Bản thử miễn phí', items:[{pluginId:'PL-RPFREE', name:'Đấu La RP FREE — Resource Pack 4 võ hồn 2D', kind:'plugin', version:'3.16.9', price:0, sale:0, unit:0, qty:1, lineTotal:0}], subtotal:0, discount:0, total:0, method:'—', status:'Đã thanh toán', paymentContent:'DAULA DH-1035', date:'2026-11-08', license:'DF-FREE-0001'},
      {id:'DH-1039', userId:'u1', package:'365 ngày', items:[{pluginId:'PL-MAIN', name:'Đấu La Đại Lục — Plugin bản quyền (365 ngày)', kind:'license', tierId:'t365', tierLabel:'365 ngày', days:365, version:'3.16.9', price:499000, sale:20, unit:399200, qty:1, lineTotal:399200}], subtotal:399200, discount:0, total:399200, method:'Napthe Viettel', status:'Đã thanh toán', paymentContent:'DAULA DH-1039', date:'2026-11-15', license:'DL-VIP-7T4M-5521'},
      {id:'DH-1043', userId:'u2', package:'30 ngày', items:[{pluginId:'PL-MAIN', name:'Đấu La Đại Lục — Plugin bản quyền (30 ngày)', kind:'license', tierId:'t30', tierLabel:'30 ngày', days:30, version:'3.16.9', price:99000, sale:0, unit:99000, qty:1, lineTotal:99000}], subtotal:99000, discount:0, total:99000, method:'Napthe Viettel', status:'Đã thanh toán', paymentContent:'DAULA DH-1043', date:'2026-11-18', license:'DL-VIP-1Q8N-7742'},
      {id:'DH-1044', userId:'u4', package:'180 ngày', items:[{pluginId:'PL-MAIN', name:'Đấu La Đại Lục — Plugin bản quyền (180 ngày)', kind:'license', tierId:'t180', tierLabel:'180 ngày', days:180, version:'3.16.9', price:299000, sale:10, unit:269100, qty:1, lineTotal:269100}], subtotal:269100, discount:0, total:269100, method:'Chuyển khoản', status:'Đã thanh toán', paymentContent:'DAULA DH-1044', date:'2026-11-19', license:'DL-VIP-3B6H-9033'},
      {id:'DH-1042', userId:'u1', package:'30 ngày', items:[{pluginId:'PL-MAIN', name:'Đấu La Đại Lục — Plugin bản quyền (30 ngày)', kind:'license', tierId:'t30', tierLabel:'30 ngày', days:30, version:'3.16.9', price:99000, sale:0, unit:99000, qty:1, lineTotal:99000}], subtotal:99000, discount:0, total:99000, method:'Napthe Mobifone', status:'Đã thanh toán', paymentContent:'DAULA DH-1042', date:'2026-11-21', license:'—'},
      {id:'DH-1045', userId:'u4', package:'30 ngày', items:[{pluginId:'PL-MAIN', name:'Đấu La Đại Lục — Plugin bản quyền (30 ngày)', kind:'license', tierId:'t30', tierLabel:'30 ngày', days:30, version:'3.16.9', price:99000, sale:0, unit:99000, qty:1, lineTotal:99000}], subtotal:99000, discount:0, total:99000, method:'Napthe Vinaphone', status:'Đã thanh toán', paymentContent:'DAULA DH-1045', date:'2026-11-23', license:'—'}
    ],
    /* Cửa hàng Plugin — sản phẩm thật của hệ thống (không bán vật phẩm in-game) */
    plugins: [
      {id:'PL-MAIN', slug:'dauladailuc-premium', licensing:true, fileUrl:"https://o1jacf0ss3i99ab3.public.blob.vercel-storage.com/files/PL-MAIN/a7k2x9/rp-full-3169-2DCHOT.zip", fileKey:'files/PL-MAIN/a7k2x9/rp-full-3169-2DCHOT.zip', fileName:'DauLaDaiLuc-Plugin-RP-FULL-3.16.9.zip', fileSize:47074, name:'Đấu La Đại Lục — Plugin bản quyền', category:'Plugin chính', kind:'plugin',
        version:'3.16.9 BETA10', price:0, sale:0, published:true, best:true, image:'/img/pl-main.jpg',
        description:'Plugin võ hồn Đấu La Đại Lục cho Paper/Spigot 1.21.1: 5 võ hồn (Hạo Thiên Chùy, Lam Điện Bá Vương Long, Cửu Tâm Hải Đường, Huyền Vũ, U Minh Linh Miêu) kèm resource pack 2D/3D riêng theo license. Bán theo THỜI HẠN: 30 / 180 / 365 ngày hoặc Vĩnh viễn.',
        features:['5 võ hồn Đấu La — skill, hiệu ứng, âm thanh riêng','CustomModelData: 710001 búa, 710007 Lam Điện, 710008 Hải Đường, 710009 Huyền Vũ, 710010 Linh Miêu','Hiệu ứng 3m + HUD máu võ hồn','License key gắn tối đa 2 server — chống chia sẻ key qua IP','Cập nhật mới miễn phí trong thời hạn license'],
        installGuide:'1. Tải file Plugin + Resource Pack trong mục "Kho Plugin đã mua".\n2. Copy file .jar vào thư mục plugins/ của server Paper 1.21.1, khởi động lại server.\n3. Nhập license key vào plugins/DauLaDaiLuc/config.yml (mục license).\n4. Copy file .zip resource pack vào thư mục resourcepacks/ của client Minecraft 1.21.1.\n5. Vào game, chạy /daula reload để kích hoạt.',
        usageGuide:'/daula give <player> <võ hồn> — cấp võ hồn.\n/daula reload — nạp lại cấu hình.\n/daula list — xem võ hồn đã kích hoạt.\nCầm item đúng CustomModelData để hiện model + hiệu ứng.',
        createdAt:'2026-11-01'},
      {id:'PL-LAMDIEN', slug:'lam-dien-ba-vuong-long', fileUrl:"https://o1jacf0ss3i99ab3.public.blob.vercel-storage.com/files/PL-LAMDIEN/c5n2r7/lam-dien-add-on-rev2.zip", fileKey:'files/PL-LAMDIEN/c5n2r7/lam-dien-add-on-rev2.zip', fileName:'LamDien-BaVuongLong-AddOn-Rev2.zip', fileSize:67122, name:'Lam Điện Bá Vương Long — Add-on võ hồn', category:'Add-on võ hồn', kind:'plugin',
        version:'rev2 (GROK)', price:0, sale:0, published:false, best:false, image:'/img/pl-lamdien.jpg',
        description:'Add-on Lam Điện Bá Vương Long rev2: mô hình refined, 29 khối, 5 đốt 1-hop xoay 1 hướng, đầu 3 khối — dùng kèm plugin chính 3.16.9. KHÔNG bán riêng — tặng kèm cho mọi license còn hạn (tải trong Kho đã mua).',
        features:['29 khối, dáng chuẩn rev2 — không đổi shape/UV so với bản duyệt','Texture 64×64 theo art panel A','CMD 710007 đã gắn sẵn trong pack FULL'],
        installGuide:'1. Tải file zip add-on trong "Kho Plugin đã mua".\n2. Cài plugin chính Đấu La Đại Lục (bắt buộc).\n3. Thay/merge resource pack theo README trong file zip.\n4. Vào game cầm item CMD 710007 để kiểm tra.',
        usageGuide:'Dùng cùng plugin chính: /daula give <player> lamdien.',
        createdAt:'2026-11-22'},
      {id:'PL-RPFREE', slug:'dau-la-rp-free', fileUrl:"https://o1jacf0ss3i99ab3.public.blob.vercel-storage.com/files/PL-RPFREE/b3m8q4/rp-free-3169-grok.zip", fileKey:'files/PL-RPFREE/b3m8q4/rp-free-3169-grok.zip', fileName:'DauLa-RP-FREE-3.16.9-LAMDIEN-GROK.zip', fileSize:32412, name:'Đấu La RP FREE — Resource Pack 4 võ hồn 2D', category:'Resource Pack', kind:'plugin',
        version:'3.16.9 2DCHOT', price:0, sale:0, published:true, best:false, image:'/img/pl-rpfree.jpg',
        description:'Resource pack FREE: 4 võ hồn 2D (Lam Điện, Cửu Tâm Hải Đường, Huyền Vũ, U Minh Linh Miêu) + Hạo Thiên Chùy chuẩn. Thử miễn phí trước khi mua bản quyền.',
        features:['4 texture 2D 64×64','Đã bỏ "parent": item/handheld — sửa lỗi item vô hình','Dùng được cho client 1.21.1 không cần license'],
        installGuide:'1. Tải file zip trong "Kho Plugin đã mua" (miễn phí — đặt hàng giá 0).\n2. Copy zip vào resourcepacks/ của client 1.21.1.\n3. Chọn pack trong Options → Resource Packs.',
        usageGuide:'Cần plugin để có item: mua plugin chính hoặc dùng server có cài Đấu La Đại Lục.',
        createdAt:'2026-11-20'}
    ],
    purchases: [],
    deposits: [
      {id:'NT-1K4X7', at:'2026-11-15 14:22', userId:'u1', user:'khach1', kind:'card', carrier:'Viettel', denom:100000, rate:20, credit:80000, serial:'DHUE8KX7WQ', status:'Thành công', balanceAfter:109700},
      {id:'NT-3P9QM', at:'2026-11-18 21:07', userId:'u2', user:'minhtan', kind:'card', carrier:'Mobifone', denom:50000, rate:15, credit:42500, serial:'511234567899', status:'Thành công', balanceAfter:42500},
      {id:'NT-7T2WA', at:'2026-11-21 08:44', userId:'u4', user:'thanhngan', kind:'card', carrier:'Vinaphone', denom:200000, rate:15, credit:170000, serial:'VTN88123456', status:'Thành công', balanceAfter:170000}
    ],
    coupons: [
      {code:'DAULA20', percent:20, maxUses:50, used:12, expires:'2026-12-31', active:true},
      {code:'CHAOMUNG10', percent:10, maxUses:100, used:87, expires:'2027-12-31', active:true},
      {code:'TET2026', percent:30, maxUses:200, used:43, expires:'2026-02-15', active:false}
    ],
    reviews: [
      {id:'RV-1', pluginId:'PL-MAIN', userId:'u1', username:'khach1', rating:5, comment:'Võ hồn Lam Điện đẹp, skill mượt. Server 30 người chạy ổn định trên Paper 1.21.1.', status:'visible', createdAt:'2026-11-20 09:10', reply:'Cảm ơn bạn! Bản BETA10 đã tối ưu tick thêm 15% nữa.'},
      {id:'RV-2', pluginId:'PL-RPFREE', userId:'u2', username:'minhtan', rating:4, comment:'Pack FREE cài dễ, 2D nét. Sẽ mua bản quyền khi có tiền.', status:'visible', createdAt:'2026-11-21 20:44', reply:''}
    ],
    tickets: [
      {id:'TK-221', userId:'u1', subject:'Model Lam Điện 2D vô hình trong game', type:'Lỗi', status:'Đang xử lý', createdAt:'2026-11-23 08:20',
        body:'Mình nạp pack DauLa-RP-FULL-3.16.9-2DCHOT vào Minecraft 1.21.1, cầm shears CMD 710007 mà tay không thấy gì, khung tranh cũng không hiện.',
        replies:[{by:'admin', at:'2026-11-23 08:40', body:'Đã xác định nguyên nhân: trường "parent": item/handheld trong model json làm model bake thất bại → item vô hình. Pack 2DCHOT mới đã bỏ parent, bạn vào "Kho Plugin đã mua" tải lại bản FULL là hết lỗi.'}]},
      {id:'TK-219', userId:'u2', subject:'Nạp thẻ Viettel chưa nhận được key', type:'Thanh toán', status:'Đã đóng', createdAt:'2026-11-18 19:02',
        body:'Mình nạp 199k Viettel lúc 18:45 mà chưa nhận được license key.',
        replies:[{by:'admin', at:'2026-11-18 19:30', body:'Key DL-VIP-1T-7742 đã gửi vào email minhtan@outlook.com, kiểm tra cả mục spam nhé.'},{by:'admin', at:'2026-11-18 19:31', body:'Đóng ticket sau khi khách xác nhận đã nhận key.'}]}
    ],
    notifications: [
      {id:'n1', to:'all', type:'update', title:'Đã phát hành 3.16.9 BETA10', body:'Lam Điện v11 — 29 khối, đơn giản tối đa. Vào "Changelog" xem chi tiết.', date:'2026-11-22', by:'admin'},
      {id:'n2', to:'u1', type:'expiry', title:'License DL-VIP-3T-5521 sắp hết hạn', body:'Còn 12 ngày (hết hạn 05/12/2026). Gia hạn sớm để giữ toàn bộ hiệu ứng võ hồn.', date:'2026-11-21', by:'admin'},
      {id:'n3', to:'all', type:'promo', title:'Khuyến mãi 20% toàn bộ gói VIP', body:'Dùng mã DAULA20 khi đặt hàng, áp dụng đến hết 31/12/2026.', date:'2026-11-20', by:'admin'}
    ],
    referrals: [
      {id:'RF-31', referrer:'khach1', buyer:'thanhngan', order:'DH-1044', amount:499000, commission:99800, status:'approved', date:'2026-11-19'},
      {id:'RF-32', referrer:'khach1', buyer:'minhtan', order:'DH-1043', amount:199000, commission:39800, status:'pending', date:'2026-11-18'},
      {id:'RF-29', referrer:'khach1', buyer:'quocbao', order:'DH-1035', amount:0, commission:0, status:'rejected', date:'2026-11-08'}
    ],
    changelog: [
      {version:'web 2.0', date:'2026-11-24', title:'Cửa hàng Plugin thật + backend/database server', items:['Cửa hàng Plugin: tìm kiếm, lọc danh mục, giỏ hàng, mua ngay, đánh giá','Thanh toán QR ngân hàng (mã Napas thật theo đơn) + thẻ cào + ví tiền','Kho Plugin đã mua — tải lại bất cứ lúc nào, server kiểm quyền tải','Backend serverless + database server: tài khoản, ví, đơn hàng lưu server','Admin A14–A19: quản lý Plugin/đơn/nạp/đánh giá/thống kê/file tải']},
      {version:'3.16.9 v1.2', date:'2026-11-24', title:'Đăng ký tk + cổng quản trị + sửa giá', items:['U13: Đăng ký tài khoản mới ngay trên web (hỗ trợ mã giới thiệu)','Cổng quản trị 2 lớp: mã 6 số + mật khẩu quản trị mới mở được khu A','A13: sửa giá sản phẩm + % giảm giá từng gói, hiện ngay ở trang chủ','A11: nạp tiền trực tiếp cho mọi tài khoản + bảng số dư tất cả tk','A6: thêm cột số dư ví trong danh sách người dùng']},
      {version:'3.16.9 BETA10', date:'2026-11-22', title:'Lam Điện v11 — đơn giản tối đa', items:['Lam Điện 29 khối: 5 đốt 1-hop xoay 1 hướng, đầu 3 khối, mặt sơn','Bỏ borm/tua/set/máy/prong','Gửi nguồn Java plugin (bundle 84 .java + decompile)']},
      {version:'3.16.9 V4CHOT', date:'2026-11-21', title:'4 võ hồn 2D + sửa lỗi render vô hình', items:['Loại bỏ "parent": item/handheld trong model võ hồn — nguyên nhân item bake thất bại','Đóng gói 4 texture 2D theo art panel A (64×64): Lam Điện Bá Vương Long, Cửu Tâm Hải Đường, Huyền Vũ, U Minh Linh Miêu','Hạo Thiên Chùy giữ nguyên - không thay đổi']},
      {version:'3.16.8', date:'2026-11-10', title:'Nạp thẻ + hệ thống kinh tế', items:['napthe: Viettel, Mobifone, Vinaphone','plugin.yml + test thật trên Paper 1.21.1 (BUILD SUCCESS)']}
    ],
    settings: {
      /* BẢO MẬT: bản gốc nhúng 1 chuỗi token thật ở đây (adminGate.password) — đã TRÍCH AN trước khi đưa lên GitHub. Token thật cần được revoke. */
      adminGate: {code:'000000', password:'***DA-TRICH-AN-TOKEN-LE-TRONG-BAN-GOC***'},
      /* Mô hình bán hàng: CHỈ 1 sản phẩm (plugin bản quyền) — 4 mốc thời hạn, mỗi mốc giá + % giảm riêng.
         days = 0 là Vĩnh viễn. Admin sửa trực tiếp các số này tại A13 (act=pricing). */
      licenseTiers: [
        {id:'t30',  days:30,  price:99000,  sale:0,  best:false},
        {id:'t180', days:180, price:299000, sale:10, best:false},
        {id:'t365', days:365, price:499000, sale:20, best:true},
        {id:'tvv',  days:0,   price:849000, sale:10, best:false}
      ],
      bank: {bin:'970422', account:'0123456789', name:'CONG TY TNHH DAU LA DAI LUC', shortName:'MB Bank', isSample:true},
      topupRates: {global:20, carriers:{viettel:20,mobifone:15,vinaphone:15,vietnamobile:20,zing:20,gate:20,garena:25,vtc:20,bit:15}},
      topupLog: [],
      creditLog: [
        {id:'CT-7F2K1', at:'2026-11-20 15:30', by:'admin', to:'khach1', amount:50000, reason:'Bồi thường', note:'Bồi thường downtime server 18/11', balanceAfter:189700},
        {id:'CT-3M9XQ', at:'2026-11-21 09:12', by:'admin', to:'minhtan', amount:20000, reason:'Khuyến mãi', note:'Khuyến mãi khách mới', balanceAfter:20000}
      ]
    }
  };
}
module.exports = {seedState};
C.setSeed(seedState);
