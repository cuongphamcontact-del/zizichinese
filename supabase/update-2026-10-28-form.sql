-- =====================================================================
-- Thêm thông tin thu thập ở form trước thanh toán:
--   - zalo_name    : tên Zalo (để duyệt vào nhóm học tập)
--   - want_invoice : khách có cần xuất hóa đơn VAT không
--   - invoice_info : thông tin hóa đơn (công ty, MST, địa chỉ, email)
-- Chạy 1 lần trong Supabase → SQL Editor. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================
alter table orders add column if not exists zalo_name    text;
alter table orders add column if not exists want_invoice boolean not null default false;
alter table orders add column if not exists invoice_info jsonb;
