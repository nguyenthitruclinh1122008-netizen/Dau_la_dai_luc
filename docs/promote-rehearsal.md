# DIỄN TẬP NÂNG CẤP web-v2-promote — HƯỚNG DẪN CHO CHỦ SHOP

> Nhánh `web-v2-promote` = web-v2 + fix Neon (25/11) + 3 đường hợp đồng plugin
> + migrate dữ liệu khách từ web chính. **CHƯA merge vào main** — chỉ build
> preview để diễn tập trên BẢN SAO dữ liệu thật.

## Vì sao phải diễn tập trước

Web v2 thay 100% backend của web chính. Khách hàng thật đang nằm trong
Neon Production (bảng `public.users / licenses / orders / packages /
settings`). Nhánh này có sẵn:
- `/api/license/activate` · `/api/license/heartbeat` · `/api/verify-key` —
  đúng hợp đồng plugin Premium đang chạy (vé ký Ed25519 + RSA-2048, khóa
  mặc định trùng web chính → plugin KHÔNG cần build lại).
- `act=migrate-v1` trong `/api/admin` — chuyển dữ liệu khách sang kho v2
  kèm BÁO CÁO ĐỐI CHIẾU SỐ LIỆU (dry-run mặc định, có checksum SHA-256
  từng dòng license để đối chiếu độc lập với DB).
- Đã kiểm chứng E2E trên PostgreSQL 17 thật: 75/75 PASS; hồi quy Blob
  A 49/49 · B 8,1s · C 2,2s.

## Các bước diễn tập (chủ shop thực hiện trên GitHub + Vercel + Neon)

### Bước 0 — đưa nhánh lên GitHub
Cách A (khuyên dùng): cấp lại 1 fine-grained token (Contents read/write,
chỉ repo này, hạn 7 ngày) → trợ lý push `web-v2-promote` giúp.
Cách B: dùng file bundle `web-v2-promote.bundle` + lệnh
`git fetch web-v2-promote.bundle web-v2-promote:web-v2-promote && git push origin web-v2-promote`.

### Bước 1 — tạo BẢN SAO dữ liệu thật trên Neon (không đụng DB chính)
1. Vào Neon console → project **production** (DB web chính).
2. **Branches → Create branch** (nguồn = production, thời điểm hiện tại).
   Branch copy nguyên dữ liệu trong ~vài giây, tách biệt hoàn toàn.
3. Copy **connection string** của branch mới (đổi password nếu muốn —
   đây là DB riêng của buổi diễn tập).

### Bước 2 — trỏ Preview sang bản sao
Vercel → project → Settings → Environment Variables:
- `DATABASE_URL` (scope **Preview**) — thay tạm bằng connection string
  của Neon branch ở Bước 1. LƯU LẠI giá trị cũ (Neon beta) để trả lại
  sau diễn tập.
- KHÔNG đụng scope Production.

### Bước 3 — build preview của nhánh
GitHub → nhánh `web-v2-promote` → sửa đại 1 dòng trong
`docs/trigger-build.md` → Commit. Vercel tự build preview cho nhánh.

### Bước 4 — MIGRATE DRY-RUN (chỉ đọc, không ghi)
Vào preview → đăng nhập quản trị → mở cổng A → console/tab mới chạy:
```
POST /api/admin  body: {"act":"migrate-v1","dry":true}
Header: cookie dl_sess=… + x-admin-ticket=…
```
(hoặc nút trong khu A nếu đã làm UI). Đọc báo cáo đối chiếu:
- đếm nguồn users/licenses/orders/packages phải khớp số Neon thật;
- `licensesChecksumSha256` — đối chiếu độc lập bằng SQL ghi trong báo cáo;
- `mapping.users.mergeWithV2` = các username trùng (TRUC_LINH) sẽ GỘP;
- `mapping.bank` — web v2 đang dùng tài khoản nhận tiền thật → GIỮ
  NGUYÊN, web chính chỉ nhường khi v2 còn là sample.

### Bước 5 — MIGRATE COMMIT (ghi vào Neon branch — vẫn là bản sao)
```
POST /api/admin  body: {"act":"migrate-v1","dry":false,"confirm":"MIGRATE-V1"}
```
Chạy lại lần nữa sẽ tự bỏ qua trùng lặp (idempotent).

### Bước 6 — kiểm tra thật trên dữ liệu đã migrate
1. Đăng nhập 1 tài khoản khách bằng MẬT KHẨU CŨ web chính (tự nâng cấp hash).
2. Lấy 1 key Premium THẬT (từ DB thật, ông còn lưu) → `/api/verify-key`
   phải trả valid + đúng hạn; tra cứu trên trang web phải thấy.
3. Kích hoạt thử key đó lên 1 server test: nhập vào plugin → phải nhận vé.
   (Vé v2 ký bằng cùng khóa v1 → plugin nhận NGAY.)
4. Trang chủ / cửa hàng: giá khuyến mãi đang chạy hiển thị đúng.
5. Tải file: key VIP tải được RP FULL, key FREE (FREE-/DF-) tải được bản FREE.

### Bước 7 — trả lại Preview như cũ
Đưa `DATABASE_URL` (Preview) về Neon beta, xóa branch Neon sau khi
chốt kết quả (hoặc giữ làm ["staging"] lâu dài).

## Sau khi diễn tập đạt
Chủ shop báo "DUYỆT" → trợ lý chuẩn bị PR `web-v2-promote` → `main`.
Merge do CHỦ SHOP bấm, trong khung giờ thấp. Rollback: Vercel Instant
Rollback + git revert; dữ liệu `public.*` không bao giờ bị v2 ghi đè.

## Lưu ý bảo mật
- Migration chỉ SELECT từ `public.*` (whitelist bảng, có LIMIT) — không
  có lệnh ghi nào nhắm vào DB web chính.
- `passV1` (hash mật khẩu cũ) KHÔNG bao giờ trả qua API công khai — chỉ
  dùng nội bộ khi đăng nhập, và tự xóa sau khi khách đổi mật khẩu.
- Báo cáo migrate chỉ trả cho session quản trị đã mở cổng.
