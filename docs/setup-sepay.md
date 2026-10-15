# Bật thanh toán tự động SePay — Hướng dẫn CHI TIẾT (không cần cài gì trên máy)

Luồng: khách điền email → trả tiền bằng VietQR → SePay báo tiền về → hệ thống tự
tạo tài khoản + gửi email đăng nhập cho học viên. Tất cả làm trên web, theo đúng
thứ tự dưới đây. Tổng thời gian ~30–45 phút.

Thứ tự: **Resend → Supabase (functions + secrets + bank_info) → SePay → Test.**

---

## PHẦN 0 · Chuẩn bị 3 thông tin (5 phút)

1. **service_role key**: vào `supabase.com` → dự án `xchteoujpstqistejips` → **Settings
   → API** → mục **Project API keys** → bấm **Reveal** ở dòng **`service_role`** →
   copy để lát dán. ⚠️ Khoá này RẤT mạnh — chỉ dán vào Supabase, KHÔNG gửi cho ai.
2. **SEPAY_WEBHOOK_API_KEY**: tự nghĩ 1 chuỗi khó đoán (vd mở trình tạo mật khẩu,
   lấy 32 ký tự). Ghi ra giấy — lát dùng 2 lần (Supabase + SePay), phải GIỐNG NHAU.
3. **Tài khoản ngân hàng nhận tiền**: số TK, tên ngân hàng, tên chủ TK (IN HOA,
   không dấu).

---

## PHẦN 1 · Resend — để gửi email đăng nhập (10 phút)

1. Vào `resend.com` → **Sign up** (đăng ký bằng email hoặc Google).
2. **Xác thực tên miền** (để mail vào Inbox, gửi từ @zizichinese.com):
   - Menu trái → **Domains** → **Add Domain** → gõ `zizichinese.com` → **Add**.
   - Resend hiện vài bản ghi **DNS** (loại TXT/MX/CNAME). Vào nơi quản lý tên miền
     `zizichinese.com` → thêm đúng các bản ghi đó → quay lại Resend bấm **Verify**
     (có thể chờ 5–30 phút để DNS cập nhật).
   - 👉 *Chưa kịp xác thực? Bỏ qua bước này để test trước* — xem ghi chú ở Phần 3.
3. **Lấy API key**: menu trái → **API Keys** → **Create API Key** → đặt tên bất kỳ →
   **Add** → **copy** chuỗi bắt đầu bằng `re_...`. Đây là **RESEND_API_KEY**.

---

## PHẦN 2 · Supabase — Deploy 3 function + khai báo khoá

### 2A. Tạo 3 Edge Function (làm lần lượt từng cái)

Code 3 function đã nằm sẵn trên GitHub, mở ra copy cho chuẩn:
- create-order: `github.com/cuongphamcontact-del/zizichinese/blob/main/supabase/functions/create-order/index.ts`
- order-status: `.../supabase/functions/order-status/index.ts`
- sepay-webhook: `.../supabase/functions/sepay-webhook/index.ts`
(Trên GitHub bấm nút **Copy raw file** góc phải để copy toàn bộ.)

Với **mỗi** function, trong Supabase:
1. Menu trái → **Edge Functions** → **Deploy a new function** → chọn **Via Editor**
   (soạn trên trình duyệt).
2. **Tên function** gõ chính xác: `create-order` (rồi `order-status`, `sepay-webhook`).
3. Xoá hết code mẫu trong ô soạn → **dán** code đã copy từ GitHub.
4. ⚠️ **Tắt xác thực JWT**: tìm ô **"Verify JWT"** (hoặc "Enforce JWT verification")
   → **gạt TẮT (off)**. Bắt buộc cho cả 3, nếu không web/SePay gọi sẽ bị chặn.
5. Bấm **Deploy function**. Chờ báo thành công.
6. Lặp lại cho 2 function còn lại.

> Nếu dashboard của bạn không có "Via Editor", báo mình — mình sẽ chuyển sang cách
> dùng Supabase CLI (có sẵn trong file này ở mục *Phụ lục CLI*).

### 2B. Khai báo khoá bí mật (Secrets)

Menu trái → **Edge Functions** → tab **Secrets** (hoặc **Manage secrets**) →
**Add new secret**, thêm từng dòng:

| Name | Value |
|------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (Phần 0) |
| `SEPAY_WEBHOOK_API_KEY` | chuỗi bí mật bạn tự đặt (Phần 0) |
| `RESEND_API_KEY` | `re_...` (Phần 1) |
| `MAIL_FROM` | `ZiZi Chinese <no-reply@zizichinese.com>` |
| `SITE_URL` | `https://zizichinese.com` |

> `SUPABASE_URL` Supabase tự có, KHÔNG cần thêm.
> Chưa xác thực domain Resend? Tạm để `MAIL_FROM` = `ZiZi Chinese <onboarding@resend.dev>`
> (chỉ gửi được tới email đăng ký Resend của bạn — đủ để test).

### 2C. Điền tài khoản ngân hàng nhận tiền

Menu trái → **SQL Editor** → **New query** → dán (thay số của bạn) → **Run**:

```sql
update settings
set value = '{"bank":"MB","account_no":"0123456789","account_name":"PHAM VAN CUONG"}'
where key = 'bank_info';
```
- `bank`: mã ngân hàng VietQR — vd `MB`, `ACB`, `VCB`, `TCB`, `BIDV`, `VPB`, `TPB`, `OCB`…
- `account_no`: số tài khoản (đúng TK sẽ nối SePay).
- `account_name`: tên chủ TK, IN HOA không dấu.

> Gửi mình 3 thông tin này, mình viết sẵn câu SQL đúng mã ngân hàng cho bạn dán.

---

## PHẦN 3 · SePay — nối ngân hàng + webhook (10 phút)

1. Đăng ký `my.sepay.vn`.
2. **Kết nối ngân hàng**: Dashboard SePay → thêm tài khoản ngân hàng (đúng TK đã điền
   ở 2C) và làm theo hướng dẫn để SePay đọc được biến động số dư.
   - Ngân hàng hợp nhất: **MB, ACB, OCB, VPBank, BIDV, TPBank, KienLongBank**…
3. **Tạo Webhook**: menu **Tích hợp (Integrations) → Webhooks → Thêm Webhook**:
   - **URL / Endpoint**: `https://xchteoujpstqistejips.supabase.co/functions/v1/sepay-webhook`
   - **Kiểu xác thực (Authentication)**: chọn **API Key**. SePay sẽ gửi header
     `Authorization: Apikey <khoá>`. Ô nhập key **dán đúng SEPAY_WEBHOOK_API_KEY**
     (phải GIỐNG HỆT chuỗi đã set ở 2B — sai 1 ký tự là webhook báo 401).
   - **Sự kiện (Event)**: chỉ giao dịch **tiền vào (money in / incoming)**.
   - **Lưu** và **bật (enabled)**.
4. Bấm **Gửi thử / Test webhook** → vào Supabase → **Table Editor → webhook_logs**
   sẽ thấy 1 dòng log mới → kết nối OK.

> Webhook tự chống xử lý trùng theo **id giao dịch SePay**, nên dù SePay gửi lại
> nhiều lần cũng chỉ kích hoạt học viên **một lần**. Khách phải giữ **nguyên nội dung
> chuyển khoản** (mã `ZIZI…` mà QR đã nhúng) — nếu khách tự xoá/sửa nội dung thì
> không khớp được đơn (log ghi `order_not_found`).

---

## PHẦN 4 · Test đầu-cuối thật

1. Tạm tạo 1 khoá giá rẻ để test (vd 2.000đ) trong trang Quản trị, hoặc dùng khoá sẵn có.
2. Vào `zizichinese.com` → chọn khoá → điền **email thật của bạn** → **Tạo đơn**.
3. Màn hình hiện **QR + số TK + nội dung (mã ZIZI…)**. Mở app ngân hàng **quét QR**,
   chuyển đúng số tiền (nội dung giữ nguyên mã).
4. Chờ 5–30 giây → trang tự hiện **"Đã nhận thanh toán"**.
5. Mở hộp thư (cả **Spam/Quảng cáo**) → có email **mật khẩu đăng nhập** → đăng nhập ở
   `zizichinese.com/#dang-nhap` → thấy khoá trong **Khu vực học**.
6. Kiểm tra trong Supabase → **Table Editor**:
   - `orders`: đơn vừa rồi `status = paid`.
   - `enrollments`: có 1 dòng mới (quyền học).
   - `webhook_logs`: dòng mới, cột `note` ghi `...; enrolled; mail_sent`.

**Nếu lỗi**, xem cột `note` trong `webhook_logs`:
- `order_not_found` → nội dung CK không chứa mã đơn (khách sửa nội dung).
- `underpaid` → chuyển thiếu tiền (đơn chuyển sang `review`, không kích hoạt).
- `no_resend_key:mail_skipped` / `mail_fail` → chưa/sai cấu hình Resend.
- `unauthorized` (SePay báo 401) → API key ở SePay ≠ secret trong Supabase.

---

## Phụ lục · Cách dùng Supabase CLI (nếu không soạn trên dashboard)

```bash
supabase login
supabase link --project-ref xchteoujpstqistejips
supabase functions deploy create-order  --no-verify-jwt
supabase functions deploy order-status  --no-verify-jwt
supabase functions deploy sepay-webhook --no-verify-jwt
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..." SEPAY_WEBHOOK_API_KEY="..." \
  RESEND_API_KEY="re_..." MAIL_FROM="ZiZi Chinese <no-reply@zizichinese.com>" \
  SITE_URL="https://zizichinese.com"
```
