# QUY CHUẨN ẢNH WEB — ĐẤU LA ĐẠI LỤC (bắt buộc từ 17/11/2026)

Mọi ảnh thêm mới lên web (Võ Hồn, Hồn Hoàn, công trình, công thức chế tạo, bảng lệnh…)
PHẢI qua script nén chuẩn trước khi commit:

```bash
python3 scripts/nen-anh-web.py file1.png file2.jpg ...      # nén từng file
python3 scripts/nen-anh-web.py --dir thu-muc-anh --out public/img/vohon
```

## Quy tắc

| Hạng mục | Chuẩn |
| --- | --- |
| Độ phân giải | 380x380px (icon/thumbnail); ảnh gốc khác tỷ lệ → co vừa khung, không cắt |
| Định dạng | WebP (`method=6`). Trong suốt giữ nguyên bằng alpha của WebP — không dùng JPG cho ảnh có nền trong suốt |
| Dung lượng | Mục tiêu <100KB/ảnh. **Rõ nét ưu tiên hơn nhỏ** — không nén dưới q=75; chấp nhận >100KB nếu cần nét; trần tuyệt đối 300KB (vượt thì hạ 70/65 rồi giảm khung 340) |
| Đường dẫn | `public/img/<loai>/<id>.webp` — ví dụ `/img/vohon/hao_thien_chuy.webp` |
| Trong code | `<img src={`/img/<loai>/<id>.webp`} width={380} height={380} loading="lazy" alt={…} />` |

## Ảnh đã nén theo chuẩn này

- 9 ảnh võ hồn `public/img/vohon/*.webp` — tổng 212KB (gốc 1002KB → tiết kiệm 79%).
