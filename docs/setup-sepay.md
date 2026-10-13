# Kết nối thanh toán tự động SePay — "Thanh toán trước, cấp tài khoản sau"

## Luồng vận hành (mới)
1. Khách chọn khoá → điền **Họ tên + Email + SĐT** (KHÔNG cần tạo tài khoản trước).
2. Bấm **Tạo đơn** → web gọi `create-order` → tạo đơn `pending` + sinh **mã VietQR động** (đã nhúng số tiền + mã đơn).
3. Khách mở app ngân hàng **quét QR** và chuyển khoản (nội dung = mã đơn, ví dụ `ZIZIAB12CD`).
4. Tiền về → **SePay gọi `sepay-webhook`** → hệ thống:
   - Khớp đơn theo **nội dung CK + số tiền**;
   - Đổi đơn sang `paid`;
   - **Tạo tài khoản học viên** (mật khẩu ngẫu nhiên) + cấp quyền học;
   - **Gửi email** chứa email + mật khẩu + nút "Đăng nhập & vào học".
5. Trang web đang mở sẽ tự nhận biết "đã thanh toán" (poll `order-status`) và hiện màn hình thành công.
6. Học viên mở email → đăng nhập → vào học.

> Trước khi deploy xong, web vẫn chạy ở **chế độ xem thử** (nút "Mô phỏng nhận tiền") nên không bị vỡ.

---

## PHẦN A — Deploy 3 Edge Function lên Supabase

Cài Supabase CLI (máy bạn), rồi trong thư mục dự án:

```bash
supabase login
supabase link --project-ref xchteoujpstqistejips

# Deploy (các hàm public để trình duyệt gọi được; webhook tự bảo vệ bằng API key)
supabase functions deploy create-order  --no-verify-jwt
supabase functions deploy order-status  --no-verify-jwt
supabase functions deploy sepay-webhook --no-verify-jwt
```

Set **secrets** (khoá bí mật — chỉ nằm ở máy chủ, KHÔNG vào code web):

```bash
supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY="<service_role key trong Supabase → Settings → API>" \
  SEPAY_WEBHOOK_API_KEY="<một chuỗi bí mật bạn tự đặt, sẽ dán vào SePay>" \
  RESEND_API_KEY="<API key của Resend>" \
  MAIL_FROM="ZiZi Chinese <no-reply@zizichinese.com>" \
  SITE_URL="https://zizichinese.com"
```

> `SUPABASE_URL` Supabase tự có sẵn, không cần set.
> `SEPAY_WEBHOOK_API_KEY` bạn tự nghĩ ra 1 chuỗi khó đoán (vd 32 ký tự ngẫu nhiên) — nhớ để dùng lại ở Phần B.

---

## PHẦN B — Tạo & kết nối SePay

1. Đăng ký tại **my.sepay.vn**.
2. **Kết nối ngân hàng** của bạn (SePay hỗ trợ đọc biến động số dư tự động).
   - Ngân hàng dễ dùng nhất với SePay: **MBBank / ACB / OCB / VPBank / BIDV / TPBank…**
3. Vào **Tích hợp → Webhooks → Thêm Webhook**:
   - **URL**: `https://xchteoujpstqistejips.supabase.co/functions/v1/sepay-webhook`
   - **Kiểu xác thực**: `API Key` → dán đúng **SEPAY_WEBHOOK_API_KEY** đã set ở Phần A.
   - **Sự kiện**: giao dịch tiền **vào (in)**.
   - Lưu & bật.
4. Dùng nút **"Gửi thử" (test webhook)** của SePay để kiểm tra kết nối (sẽ thấy log trong bảng `webhook_logs`).

---

## PHẦN C — Email gửi thông tin đăng nhập (Resend)

1. Đăng ký **resend.com** (free 3.000 mail/tháng).
2. **Domains → Add Domain** = `zizichinese.com` → thêm các bản ghi DNS (SPF/DKIM) Resend cung cấp vào nơi quản lý tên miền → bấm **Verify**.
3. **API Keys → Create** → copy key → đó là `RESEND_API_KEY` ở Phần A.
4. `MAIL_FROM` dùng địa chỉ thuộc domain đã verify, vd `no-reply@zizichinese.com`.

> Chưa kịp verify domain? Tạm để `MAIL_FROM="ZiZi Chinese <onboarding@resend.dev>"` để test (chỉ gửi được tới email của chính bạn).

---

## PHẦN D — Điền tài khoản ngân hàng nhận tiền

Mã VietQR lấy thông tin từ bảng `settings` key `bank_info`. Chạy trong **Supabase → SQL Editor**:

```sql
update settings
set value = '{"bank":"MB","account_no":"0123456789","account_name":"PHAM VAN CUONG"}'
where key = 'bank_info';
```

- `bank`: mã ngân hàng VietQR (vd `MB`, `ACB`, `VCB`, `TCB`, `BIDV`, `VPB`…) hoặc mã BIN 6 số.
- `account_no`: số tài khoản nhận tiền (đúng tài khoản đã nối SePay).
- `account_name`: tên chủ tài khoản (IN HOA, không dấu).

---

## Cần bạn chuẩn bị / gửi
- [ ] **Service role key** (Supabase → Settings → API) — để set secret (tự làm, không gửi ai).
- [ ] Nghĩ 1 chuỗi **SEPAY_WEBHOOK_API_KEY** bí mật.
- [ ] **Số TK + tên NH + tên chủ TK** (để điền `bank_info`).
- [ ] Tài khoản **SePay** đã nối ngân hàng.
- [ ] Tài khoản **Resend** + verify `zizichinese.com`.

## Test đầu-cuối
1. Vào `zizichinese.com` → chọn 1 khoá rẻ (hoặc tạo khoá test giá 2.000đ) → điền email thật của bạn → Tạo đơn.
2. Quét QR, chuyển đúng số tiền + đúng nội dung.
3. Chờ 5–30 giây → trang hiện "Đã nhận thanh toán".
4. Kiểm tra email → có email + mật khẩu → đăng nhập được → thấy khoá trong Khu vực học.
5. Kiểm tra `orders` (status=paid), `enrollments` (có dòng mới), `webhook_logs` (note=...enrolled; mail_sent).
