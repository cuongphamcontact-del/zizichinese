-- Cập nhật sản phẩm "Trọn bộ 5000 từ vựng HSK" thành gói App học + Excel + PDF.
-- Chạy 1 lần trong Supabase → SQL Editor (schema.sql dùng "on conflict do nothing" nên không tự cập nhật bản đã có).
update products set
  name        = 'Trọn bộ 5000 từ vựng HSK (App học + Excel + PDF)',
  level_label = 'Tài liệu · tự học',
  description = 'App học thẻ nhớ & luyện gõ chữ Hán có lịch ôn tự động, kèm Excel theo dõi tiến độ và PDF tra cứu 236 trang. Bản mềm tải ngay, bản cứng in màu giao tận nơi.',
  res_count   = 4
where slug = 'tai-lieu-5000-tu';

-- Link tải giao cho người mua: KHÔNG ghi vào repo công khai.
-- Thêm trong Admin → Sản phẩm → Sửa "Trọn bộ 5000 từ vựng HSK" → ô "Link tài liệu", mỗi dòng: Tên | link
--   Trọn bộ 5000 từ vựng HSK (App + Excel + PDF) | https://drive.google.com/...
