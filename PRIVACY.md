# CHÍNH SÁCH QUYỀN RIÊNG TƯ — PLUGIN ĐẤU LA ĐẠI LỤC

Phiên bản: 3.7.0 · Ngày hiệu lực: 06/11/2026

## 1. Chúng tôi thu thập ĐÚNG và ĐỦ những gì?

Khi plugin kích hoạt key hoặc xác nhận lại định kỳ (heartbeat), hệ thống nhận **đúng 4 trường**:

| # | Trường | Mục đích |
|---|--------|----------|
| 1 | Key bản quyền | Xác nhận key hợp lệ, gói, hạn dùng |
| 2 | HWID **đã băm SHA-256** (UUID cài đặt + tên hệ điều hành + kiến trúc CPU) | Gắn key với đúng 1 server, chống chia sẻ key |
| 3 | Phiên bản plugin | Tương thích vé bản quyền |
| 4 | Phiên bản Minecraft | Tương thích vé bản quyền |

## 2. Chúng tôi KHÔNG thu thập gì?

- ❌ Địa chỉ IP của server hoặc của người chơi;
- ❌ Danh sách, tên, UUID người chơi;
- ❌ Tọa độ, hành vi, chat, thế giới người chơi;
- ❌ Nội dung file, dữ liệu server;
- ❌ Bất kỳ mã thực thi nào từ xa — server bản quyền chỉ trả về vé ký số và thông tin license, plugin không nhận lệnh để chạy.

## 3. HWID được tạo thế nào?

Lần chạy đầu, plugin sinh một **UUID ngẫu nhiên** lưu trong thư mục dữ liệu plugin (`install-id.txt`). HWID = SHA-256(UUID + tên hệ điều hành + kiến trúc CPU), chỉ lấy 40 ký tự hex. Không đọc địa chỉ MAC, không đọc số serial phần cứng.

## 4. Dữ liệu lưu ở đâu, bao lâu?

- Server bản quyền lưu: băm key, HWID băm, thời điểm kích hoạt, lịch sử heartbeat — để quản lý license của bạn.
- Xóa key (hết hạn/được yêu cầu xóa) → dữ liệu license liên quan được xóa theo.
- Trên server của bạn: plugin lưu cấu hình và dữ liệu gameplay **ngay trên máy bạn** — chúng tôi không có quyền truy cập.

## 5. Thu hồi / hết hạn / ân hạn

- Key hết hạn hoặc bị thu hồi → plugin hạ về chế độ Free (soft-lock), **không xóa bất kỳ dữ liệu nào** của server bạn.
- Mất mạng: vẫn chạy trong ân hạn mặc định **72 giờ** rồi mới hạ về Free.
- Xem chi tiết trong EULA: https://dau-la-dailuc.netlify.app/eula

## 6. Quyền của bạn

- Yêu cầu xem, xóa dữ liệu license của bạn: liên hệ qua thông tin hỗ trợ.
- Hủy kích hoạt bất cứ lúc nào: `/dl license deactivate` — dữ liệu local nằm lại server bạn.

## 7. Liên hệ

- Người bán: [ĐIỀN — tên chủ shop]
- Email: [ĐIỀN]
- Website: https://dau-la-dailuc.netlify.app
