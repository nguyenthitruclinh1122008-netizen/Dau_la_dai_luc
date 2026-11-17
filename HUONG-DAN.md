# ĐẤU LA ĐẠI LỤC PLUGIN — BẢN 3.1.0 (FREE + PREMIUM)

> Ngày phát hành: 06/11/2026 · Nền bảo mật: ticket Ed25519 + lớp bẫy tamper-trap 6 lớp

---

## 1. TÍNH NĂNG MỚI 3.1.0

### 1.1. Công Trình Đấu La — giờ có 10 loại (`/dlct build <loại>`)

| Công trình | Bản | Hiệu ứng quanh công trình |
|---|---|---|
| Vọng Hồn Đài | FREE | hồi Hồn Lực nhanh |
| Thánh Điện Hồn Sư | FREE | hồi máu + Regeneration |
| Đài Tu Luyện | FREE | tu vi tăng nhanh khi đang thiền |
| **Hải Thần Điện** *(mới)* | FREE | thở dưới nước + hồi Hồn Lực (3%/lượt) |
| **Phong Linh Tháp** *(mới)* | FREE | đào nhanh (Haste) + bật cao (Jump) |
| Thiên Kiêu Đài | FREE | tu vi cho MỌI Hồn Sư quanh đài |
| Hồn Trận Tháp | PREMIUM | Sức Mạnh + Kháng sang |
| Linh Vực Môn | PREMIUM | Tốc Hành + Nhìn Trong Đêm |
| **Sát Thần Điện** *(mới)* | PREMIUM | **Sát Thần Lĩnh Vực**: Sức Mạnh II + Haste |
| **Thần Cung** *(mới)* | PREMIUM | Tái tạo II + Hộ Khiên II + Kháng sang |

- Bản Free xây được **6 loại**; 4 loại Thánh/Premium chỉ mở bằng vé Ed25519.
- Công trình premium khi người không vé thử xây → thông báo mua key tại shop.

### 1.2. Hoạt ảnh "điện ảnh" (A30) — thêm 3 lớp mới

1. **Trận Kỳ 4 Cột** *(mới)* — 4 chấm sáng bay quanh chân cột công trình.
2. **Mưa Sao Thần** *(mới)* — chỉ công trình PREMIUM: sao sáng rơi từ trên cao xuống kèm âm thanh Conduit.
3. **Hào Quang Thần** *(mới)* — Hồn Sư đứng trong công trình PREMIUM có quầng sáng lấp lánh trên đầu.
4. (Cũ) Vành hồn xoay 2 lớp, cột sáng END_ROD, xoác ốc tiên bay lên, vòng hồn niên hạn xoay quanh người chơi.

Tắt/bật từng lớp trong `config.yml` → `structures.cinema*`.

### 1.3. Võ Hồn — thêm 2 võ hồn MIỄN PHÍ (cả 2 bản đều có)

| Võ Hồn | Hệ | Điểm nhấn |
|---|---|---|
| **Bạch Hổ Vương** *(mới)* | Thánh/Thú | Hổ Trảo Phá Không, Hổ Vĩ Hoành Tảo, Bạch Hổ Thiên Phạt (METEOR) — 9 kỹ năng |
| **Hỏa Phượng Hoàng** *(mới)* | Hỏa/Thú | toàn kỹ năng gây cháy, Phượng Vũ Diệm Sơn (METEOR lửa), aura hồi máu team — 9 kỹ năng |

- Free: Thánh Long Vương, Cửu Vĩ Linh Hồ, Bạch Hổ Vương, Hỏa Phượng Hoàng (+ võ hồn cũ 2.x).
- Premium: thêm 3 võ hồn đỉnh cao **chỉ nằm trong blob ký theo vé** (Hạo Thiên Chùy, Thất Bảo Lưu Ly Tháp, Lâm Điện Bá Vương Long) — jar không chứa công thức.

---

## 2. BẢO MẬT — 3 LỖ HỔNG ĐÃ VÁ + 6 LỚP BẪY

### 2.1. Ba lỗ hổng đã được vá triệt để (kiểm chứng bằng test tự động)

| # | Lỗ hổng cũ | Trạng thái |
|---|---|---|
| 1 | Nhánh key offline 24 ký tự HMAC-SHA256 trong `I_1.java` (chuỗi `DauLaDaiLuc#2026$Premium`, mảng `Il_I.a`) | **ĐÃ XÓA SẠCH** — soi toàn bộ jar không còn bản rõ của chuỗi khóa; Test23 mục 4: key legacy bị chặn tuyệt đối |
| 2 | Fallback: mất online / URL trống / sai host → lùi về HMAC offline | **ĐÃ BỎ** — chỉ có 2 trạng thái: có vé ký Ed25519 còn grace → Premium; còn lại → Free |
| 3 | Backdoor "hoangde" can thiệp cấu hình server | **ĐÃ XÓA** — quét toàn bộ 2 jar: 0 kết quả |

### 2.2. Lớp bẫy tamper-trap 6 lớp (âm thầm, không phá hoại)

| Lớp | Class | Cơ chế |
|---|---|---|
| 1. Giả thành công | `Q` | Biến `licenseValid`/`isPremium`/`entitlementMask` trông như cổng license thật, chỉ dùng TRANG TRÍ menu. Gameplay đọc vé từ `Il_I`/`P` — kẻ vá nhánh Q chỉ làm màu menu đổi, tính năng vẫn theo vé thật |
| 2. Mồi HMAC cũ | `I_1.x()` *(mới 3.1.0)* | Decompile thấy "mô-đun tương thích key 2.2" với đúng chuỗi khóa cũ — vá cho nó trả true thì KHÔNG thay đổi gì (kết quả chỉ đếm số liệu, không điều khiển) |
| 3. Honeypot class | `H` | `LicenseValidatorCore`/`verifyLicenseChain`/`checkPremiumStatus` — luồng chính KHÔNG gọi (luôn từ chối) |
| 4. Soft-degrade | `Z` | Jar bị vá (hash lệch) hoặc vé giả mạo 3 lần/10 phút → hẹn NGẪU NHIÊN 2–72 giờ → giảm nhẹ 4–10% damage/tỉ lệ rơi/hiệu quả công trình. Không crash, không log, không báo — kẻ crack không biết bị phát hiện |
| 5. Telemetry heartbeat | `M` | Gửi kèm heartbeat: phiên bản JVM, số javaagent/agentlib, số class đã nạp, vân tay SHA-256 của T.class/M.class — web đối chiếu `DAULA_BUILD_HASHES`, lệch → âm thầm đánh dấu `suspicious` |
| 6. Watermark theo key | `P` + `W30` + `A30` + `S30` | Vé chứa `w` (1–63) riêng từng key: chiều xoay vòng hồn, NBT `dlwm` trên item rơi, id công trình → leak bản crack là truy ra key gốc |

**Cam kết an toàn:** bẫy KHÔNG phá dữ liệu người chơi/world, KHÔNG crash, KHÔNG thông báo bị phát hiện, fail-open cho người dùng thật (mọi lỗi → hệ số 1.0).

### 2.3. Nền tảng giữ nguyên chuẩn ~8.5–9/10

Vé Ed25519 ngắn hạn 15–60 phút + grace 24–72h · heartbeat 10–30 phút · thu hồi → về Free ngay · bind ID server (world UID), đổi máy ≤ 2 lần/30 ngày · HTTPS bắt buộc + pin SPKI/TOFU · AES-256-GCM secure.dat · Hash Check toàn entry jar (T↔M kiểm chéo) · String Encryption · không dùng MAC/CPU.

---

## 3. CÀI ĐẶT & KÍCH HOẠT

1. Copy `DauLaDaiLuc-Free-3.1.0.jar` (hoặc Premium) vào `plugins/`, khởi động server.
2. Mở `plugins/DauLaDaiLuc/config.yml`:
   ```yaml
   licensing:
     key: "<KEY của bạn>"        # hoặc dùng lệnh /dl license activate <KEY>
     online:
       url: "https://<domain-web-shop-của-bạn>"
       heartbeat-minutes: 15
   ```
   - `url` PHẢI đúng domain nhúng trong plugin (khác host → chỉ chạy Free).
3. Premium cần vé từ server bản quyền: mất mạng tối đa 48–72 giờ (grace), hết grace về Free.
4. Web shop: đặt env `DAULA_BUILD_HASHES` theo giá trị ở mục 5 để telemetry đối chiếu hash (tùy chọn nhưng nên làm).

## 4. KEY PREMIUM CỦA CHỦ SHOP

- **Key chủ (vĩnh viễn, không giới hạn đổi máy):** `0BZG-R7R0-0000-0FTA-B53J-56ST`
  - Kích hoạt: `/dl license activate 0BZG-R7R0-0000-0FTA-B53J-56ST`
  - Key này KHÔNG cần DB — chạy được trên mọi bản deploy website (nằm trong `MASTER_KEYS`).
  - **Nên đổi** bằng env `LICENSE_MASTER_KEYS=<key-mới-1>,<key-mới-2>` trên web deploy (khóa mặc định nằm trong mã nguồn, coi như đã bán rộng).
- Key bán cho khách: tạo qua trang Mua Key + Admin duyệt (key dạng `DL-XXXX-XXXX-XXXX-XXXX`, lưu DB, thu hồi/đổi máy quản lý hết trong /admin).

## 5. BUILD HASHES (đặt env `DAULA_BUILD_HASHES` trên web)

```
DAULA_BUILD_HASHES=T:4ea486b9aa2aedaf58397058a19c5ade2fe388debbfb39e119ca61d303c950ff,M:346d307ad7aaf8f33714fb6ff6f43239828b54c976a97b37453ef5cfa06ed063   # Premium 3.1.0
DAULA_BUILD_HASHES=T:53279931ba9632eb08c9d619c3c2ef8ff55a0b68ca83abc4e60f5554bcbfdae4,M:eba28056c12c7f8c68a64597cd3b719a847d0d6d9593b1f5525ff7862f145441   # Free 3.1.0
```

SHA-256 toàn file:
```
0a88f9bea8bb04324d4d16cd15363801c260a56b77602cbb38148f740921bae2  DauLaDaiLuc-Premium-3.1.0.jar
6bcf504a33376000efe9b9e654d372fd5987fe21efe327cf8ae8d3a9f647480e  DauLaDaiLuc-Free-3.1.0.jar
```

## 6. KẾT QUẢ KIỂM THỬ TRƯỚC KHI GIAO

| Bộ test | Kết quả |
|---|---|
| Test23 trên jar Premium 3.1.0 (vé Ed25519, chặn key legacy, URL host, secure.dat GCM, anti-tamper trên jar thật) | **41/41 PASS** |
| Test23 trên jar Free 3.1.0 | **18/18 PASS** |
| E2E web thật (PGlite): mua → duyệt → cấp key → activate → heartbeat → watermark/telemetry flag → replay → đổi máy 2/30 → chặn FREE/legacy/key lạ → thu hồi → reset bind | **40/40 PASS** |
| E2E 3.1.0: tạo đơn → duyệt → tải jar qua route (khớp byte build) → KEY CHỦ + key DB kích hoạt, wm 1–63 | **10/10 PASS** |
| Soi jar: không `hoangde`, không bản rõ `DauLaDaiLuc#2026`, không META-INF/maven, đã strip LineNumberTable/SourceFile | **SẠCH** |
| YAML config 2 jar (10 công trình, cinema flags, THAN_CAP, licensing.online) | **ĐẠT** |
