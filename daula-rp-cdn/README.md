# dau-la-rp-cdn — Resource Pack FULL (host: dau-la-rp.vercel.app)

File zip RP FULL được deploy trực tiếp lên project Vercel `dau-la-rp`
(domain `dau-la-rp.vercel.app`, deploy bằng `vercel deploy` từ thư mục này).

## Bản hiện có

| File | SHA-1 | Trạng thái |
|---|---|---|
| `DauLa-RP-FULL-3.16.3.zip` | `3f519b78a63e1adc345718f9f810464a50df21f4` | ĐANG được jar 3.16.6 + 3.16.8 trỏ tới (`resourcepack.full.url` + `.sha1` nhúng trong config.yml) — KHÔNG được sửa nội dung |
| `DauLa-RP-FULL-3.16.8.zip` | `f4846b7b6699e113a036fca62b568a13b9017971` | Bản FIX lệch F5 (thirdperson) — chờ bản plugin TIẾP THEO trỏ tới |

## Quy tắc bắt buộc

- Client Minecraft đối chiếu SHA-1 mà server đẩy (`resourcepack.full.sha1` nhúng
  trong config.yml của jar, do build tự điền) với SHA-1 file tải về → sai hash là
  client từ chối pack. Vì vậy mỗi lần đổi nội dung zip PHẢI đổi tên file mới
  (bump version) và bản build plugin mới phải điền đúng url + sha1 mới.
- Zip 3.16.8 gồm: model Hạo Thiên Chùy v6 (25 elements, texture 128×128) với
  display thirdperson/firstperson đã chuẩn hóa theo giá trị handheld đã kiểm chứng
  của model đơn giản 3.15 (bbox 2 model cùng nằm gọn giữa space x=8, z=8),
  + đủ 8 model 3D và 8 override (beacon, blaze_rod, bone, diamond_axe, diamond_sword,
  netherite_sword, oak_leaves) — FULL-3.16.3 trước đó chỉ còn búa, đã mất 7 model
  từ thời 3.15.4, bản này khôi phục đủ.
