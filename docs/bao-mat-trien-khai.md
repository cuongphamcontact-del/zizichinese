# Bảo mật khi triển khai (checklist)

Ba việc bắt buộc trước khi mở thanh toán / đăng ký học viên. Phần code đã có sẵn trong repo; phần **cài đặt trên dashboard** phải làm tay vì không lưu trong code được.

---

## 1. Khóa bí mật chỉ ở Edge Function (phía máy chủ)

**Nguyên tắc:** trình duyệt chỉ được giữ `SUPABASE_URL` + khóa **publishable/anon** (`sb_publishable_…`). Khóa đó an toàn vì mọi bảng đã bật RLS. Tuyệt đối không đưa vào `index.html`:

| Khóa | Để ở đâu |
|---|---|
| `service_role` / `sb_secret_…` | Supabase tự cấp cho Edge Function (`SUPABASE_SERVICE_ROLE_KEY`) — không cần copy đi đâu |
| SePay webhook API key | `supabase secrets set SEPAY_WEBHOOK_KEY=…` |
| Resend API key (sau này) | `supabase secrets set RESEND_API_KEY=…` |

**Đã có trong repo:**
- `supabase/functions/sepay-webhook/index.ts` — nhận webhook SePay: xác thực API key, chống xử lý trùng (`sepay_txn_id`), ghép đơn theo mã `ZIZI…`, kiểm tra số tiền (thiếu → `review`), đánh dấu `paid`, mở quyền học, ghi `webhook_logs`.
- `scripts/check-secrets.sh` + GitHub Action **"Kiểm tra khóa bí mật"** — tự chạy mỗi lần push, báo đỏ nếu code trình duyệt chứa khóa bí mật hoặc nhắc tới `service_role`.

**Cách triển khai (làm 1 lần):**
```bash
npm i -g supabase                     # hoặc: brew install supabase/tap/supabase
supabase login
supabase link --project-ref xchteoujpstqistejips
supabase secrets set SEPAY_WEBHOOK_KEY="$(openssl rand -hex 32)"
supabase functions deploy sepay-webhook --no-verify-jwt
```
Rồi vào **SePay → Tích hợp Webhooks → Thêm webhook**:
- URL: `https://xchteoujpstqistejips.supabase.co/functions/v1/sepay-webhook`
- Kiểu chứng thực: **API Key** → dán đúng chuỗi `SEPAY_WEBHOOK_KEY` vừa tạo.

Nếu lỡ để lộ khóa ở đâu đó: vào Supabase → Settings → API Keys → **tạo khóa mới và thu hồi khóa cũ** ngay; với SePay thì đổi API key webhook rồi `supabase secrets set` lại.

---

## 2. Bật xác nhận email (khi mở đăng ký học viên — Giai đoạn 2)

**Cách nhanh (dashboard):** Supabase → **Authentication → Sign In / Providers → Email** → bật **Confirm email** → Save.
Đồng thời ở **Authentication → URL Configuration**: Site URL = `https://zizichinese.com`, Redirect URLs thêm `https://zizichinese.com/**`.

**Cách bằng code:** `supabase/config.toml` đã đặt `enable_confirmations = true`. Chạy `supabase config push` để đẩy lên project (CLI sẽ hiện phần khác biệt để bạn xác nhận trước khi ghi).

Khi code luồng đăng ký, gọi `signUp` kèm `options.emailRedirectTo: 'https://zizichinese.com/'` và báo khách "kiểm tra email để kích hoạt tài khoản". Nên cấu hình SMTP riêng (Resend) + SPF/DKIM/DMARC để thư không vào Spam — SMTP mặc định của Supabase giới hạn rất ít thư/giờ.

---

## 3. Bật Enforce HTTPS trên GitHub Pages

GitHub → repo **zizichinese** → **Settings → Pages** → tích **Enforce HTTPS**.
- Nếu ô bị mờ: đợi GitHub cấp chứng chỉ cho `zizichinese.com` (vài phút đến 24 giờ sau khi DNS trỏ đúng), kiểm tra DNS có bản ghi A tới `185.199.108–111.153` (và `www` CNAME tới `<user>.github.io`).
- Kiểm tra: mở `http://zizichinese.com` → phải tự chuyển sang `https://`.

**Đã có trong repo:** `index.html` có đoạn script ở đầu trang tự chuyển `http://` → `https://` (lớp dự phòng; không thay thế được cài đặt Enforce HTTPS ở trên).
