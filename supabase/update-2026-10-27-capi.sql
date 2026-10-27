-- =====================================================================
-- Conversions API (CAPI): gửi sự kiện Purchase về Facebook từ SERVER
-- khi webhook SePay xác nhận tiền về (đo chính xác đơn chuyển khoản).
-- Chạy 1 lần trong Supabase → SQL Editor. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

-- Lưu dữ liệu đối sánh của Facebook ngay lúc tạo đơn (ở trình duyệt khách)
alter table orders add column if not exists fbp text;               -- cookie _fbp
alter table orders add column if not exists fbc text;               -- cookie _fbc (hoặc dựng từ fbclid)
alter table orders add column if not exists client_ua text;         -- user-agent trình duyệt
alter table orders add column if not exists client_ip text;         -- IP khách
alter table orders add column if not exists event_source_url text;  -- URL khách đặt đơn

-- Lưu ý: event_id để chống trùng = chính 'code' của đơn (đã có sẵn).
