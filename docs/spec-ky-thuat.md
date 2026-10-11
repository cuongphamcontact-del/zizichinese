# ZiZi Chinese — Bản mô tả kỹ thuật (giao cho AI lập trình / developer)

> Cách dùng: đính kèm file thiết kế `tieng-trung-khoi-net.html` (bản demo giao diện) **và** file này. Nói với AI: *"Dựng web thật theo spec này, dùng file HTML kèm theo làm chuẩn giao diện."*

---

## 0. Tóm tắt dự án

Website bán khóa học tiếng Trung và tài liệu, thương hiệu **ZiZi Chinese** (`zizichinese.com`), thị trường Việt Nam, tiếng Việt.

Ba khối chính:
1. **Web bán hàng** (khách xem, mua) — bắt buộc giao diện mobile-first.
2. **Khu vực học viên** — xem video, tải tài liệu, theo dõi tiến độ.
3. **Admin panel** — quản lý toàn bộ website, không cần sửa code.

**Thanh toán tự động qua SePay:** khách quét VietQR → tiền về → SePay bắn webhook → hệ thống tự kích hoạt tài khoản + gửi email. Không có bước "khách bấm xác nhận đã trả", không có thao tác tay của admin.

---

## 1. Công nghệ đề xuất

| Thành phần | Lựa chọn |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| CSS | Tailwind CSS |
| Database + Auth + Storage | Supabase |
| Thanh toán | SePay (VietQR + webhook đối soát) |
| Email giao dịch | Resend (hoặc SendGrid) |
| Video | Vimeo / Bunny Stream / VdoCipher (chọn 1, cấu hình được trong admin) |
| Hosting | Vercel |

---

## 2. Cấu trúc dữ liệu (Supabase / Postgres)

### `products` — sản phẩm (khóa học **và** tài liệu chung một bảng)
```
id                uuid pk
type              enum('course','doc')      -- khóa học video | tài liệu PDF/Excel
name              text
slug              text unique               -- tự sinh từ tên, sửa được
subtitle          text                      -- phụ đề / tagline
description       text
char_icon         text                      -- ký tự Hán làm icon (一,二,中,部…)
level_label       text                      -- "HSK 1 · mất gốc"
cover_url         text                      -- ảnh bìa (Supabase Storage)
gallery           jsonb                     -- mảng URL ảnh phụ
price             int                       -- giá bán (VND)
original_price    int                       -- giá gốc để gạch ngang
status            enum('sale','preorder')
preorder_enabled  bool
open_at           timestamptz               -- thời điểm mở quyền học
category          text
delivery_note     text                      -- ghi chú giao hàng / mở quyền
author            text
publisher         text
tags              text[]                    -- topic tags
related_ids       uuid[]                    -- sản phẩm liên quan
landing_json      jsonb                     -- block landing: hero, stats, whyBuy,
                                            -- outline, outcomes, audience,
                                            -- testimonials, packages, faq, cta
published         bool                      -- ẩn/hiện trên web
featured          bool                      -- thẻ lớn nổi bật
sort_order        int                       -- ★ THỨ TỰ HIỂN THỊ, admin kéo/bấm ▲▼
-- riêng type='doc':
has_soft          bool                      -- bán bản mềm (tải về)
has_hard          bool                      -- bán bản cứng (giao hàng)
hard_price        int
ship_fee          int
created_at, updated_at
```

### `lessons` — bài học (thuộc `products` type='course')
```
id, product_id fk, sort_order int
title             text     -- "Buổi 5 · Bài 1 你好 — Xin chào"
video_provider    enum('vimeo','bunny','vdocipher','upload')
video_id          text     -- ID/link video ở nền tảng thứ 3
duration_sec      int
is_preview        bool     -- cho xem thử miễn phí
```

### `lesson_files` — tài nguyên của từng buổi
```
id, lesson_id fk, name, file_url, file_type, size_bytes, sort_order
```

### `product_files` — file bán kèm của tài liệu (type='doc')
```
id, product_id fk, name, file_url, file_type, size_bytes
```

### `orders` — đơn hàng
```
id                uuid pk
code              text unique          -- "ZIZI7K3P", dùng làm nội dung chuyển khoản
user_id           uuid fk nullable
customer_name     text
customer_email    text
customer_phone    text
product_id        uuid fk
variant           enum('course','soft','hard')   -- bản mềm / bản cứng
amount            int                   -- tổng phải trả (đã gồm ship)
ship_fee          int
shipping_address  text                  -- chỉ khi variant='hard'
channel           text                  -- TikTok / Facebook / Zalo / Trực tiếp
status            enum('pending','paid','refunded','cancelled')
source            enum('auto','manual') -- ★ đơn từ web hay admin nhập tay
paid_at           timestamptz
sepay_txn_id      text                  -- id giao dịch SePay đối chiếu
created_at
```

### `users` / `profiles` — học viên
```
id (auth.users), full_name, email, phone, avatar_url
source            enum('auto','manual') -- ★ tự động khi mua | admin thêm tay
created_at
```

### `enrollments` — quyền sở hữu (ai được học gì)
```
id, user_id fk, product_id fk, order_id fk nullable,
granted_by enum('purchase','manual'), expires_at nullable, created_at
```

### `lesson_progress`
```
id, user_id, lesson_id, completed bool, seconds_watched int, updated_at
```

### `settings` — cấu hình sửa được trong admin (key-value)
```
key, value jsonb
-- fb_pixel_id, tiktok_pixel_id, ga4_id, fb_capi_token,
-- events_enabled {pageview, viewcontent, initiatecheckout, lead, purchase},
-- bank_info {bank, account_no, account_name},
-- shipping_default_fee, site_meta {title, description, og_image}
```

### `shipments` — vận đơn bản cứng
```
id, order_id fk, carrier, tracking_code,
status enum('pending','packing','shipped','delivered'), updated_at
```

---

## 3. Admin panel — yêu cầu chi tiết

Đường dẫn: **subdomain riêng** `admin.zizichinese.com` (hoặc `/quan-tri`), **bắt buộc đăng nhập Supabase Auth**, phân quyền theo role `admin`. Không được để bất kỳ trang admin nào truy cập được khi chưa đăng nhập.

### 3.1 Tổng quan
KPI: doanh thu tháng, số đơn, học viên mới, tỉ lệ chuyển đổi (có % so kỳ trước). Biểu đồ doanh thu 7/30 ngày. Đơn gần đây (realtime). Sản phẩm bán chạy.

### 3.2 Sản phẩm ★ (quan trọng nhất)
- Danh sách có **nút ▲▼ hoặc kéo-thả để đổi thứ tự** → cập nhật `sort_order` → web ngoài đổi theo ngay.
- **Thêm / sửa / xóa** sản phẩm. Form đầy đủ đúng như bản demo:
  - Loại sản phẩm (khóa học / tài liệu), trạng thái (đang bán / đặt trước)
  - Tên, **slug tự sinh từ tên** (sửa được), phụ đề, mô tả dài
  - **Ảnh bìa: upload trực tiếp** lên Supabase Storage (kèm preview) **hoặc** dán URL. Chuẩn 2:3, khuyến nghị 1200×1800px, ≤5MB
  - Thư viện ảnh phụ
  - Giá gốc + giá bán (**tự tính % giảm**)
  - Preorder + thời điểm mở quyền + ghi chú giao hàng
  - Danh mục, tác giả, NXB
  - **Topic tags**: chọn từ danh sách có sẵn + thêm tag tự do
  - **Sản phẩm liên quan** (chọn nhiều)
  - **Landing JSON** (có kiểm tra cú pháp, báo lỗi nếu sai)
  - Checkbox **Xuất bản** / **Nổi bật**
  - Riêng tài liệu: bật **bản cứng**, giá bản cứng, phí ship
- **Quản lý bài học** (trong sản phẩm loại khóa học):
  - Sửa tiêu đề từng buổi trực tiếp trên dòng
  - **Thêm buổi / xóa buổi / đổi thứ tự**
  - Gắn video **2 cách**: dán link/ID từ nền tảng thứ 3, **hoặc upload video** lên kho
  - **Upload file bài tập** (PDF, Excel, audio, zip) cho từng buổi
  - Đánh dấu buổi cho xem thử miễn phí

### 3.3 Đơn hàng
- Bảng đầy đủ, **lọc theo trạng thái**, tìm kiếm theo mã/tên/email/SĐT.
- **Thêm và sửa đơn thủ công** (khách đóng tiền mặt, chuyển khoản ngoài luồng).
- Đổi trạng thái. Khi chuyển sang `paid` → **tự động mở quyền học + gửi email + bắn sự kiện Purchase**.
- Đơn bản cứng: quản lý địa chỉ, mã vận đơn, trạng thái giao hàng.
- Xuất Excel/CSV.

### 3.4 Học viên
- Danh sách, tìm kiếm, xem đã mua gì, tiến độ học.
- **Song song tự động + thủ công**: hiển thị rõ cột nguồn. Admin **thêm/sửa học viên tay** và **cấp quyền khóa học thủ công** (tặng khóa, chuyển từ nơi khác).
- Thu hồi quyền, đặt lại mật khẩu.

### 3.5 Tracking & cấu hình
- Ô nhập: **Facebook Pixel ID, TikTok Pixel ID, GA4 Measurement ID, Facebook Conversions API token**. Lưu vào `settings`, tự nhúng vào `<head>` web ngoài.
- **Bật/tắt từng sự kiện chuyển đổi**: PageView, ViewContent, InitiateCheckout, Lead, Purchase.
- `Purchase` phải gửi kèm `value` + `currency: VND`.
- Nên gửi cả **server-side** (FB CAPI + TikTok Events API) để không mất dữ liệu khi khách chặn cookie.
- Báo cáo: nguồn truy cập, landing hiệu quả nhất, **phễu chuyển đổi** (xem trang → xem sản phẩm → vào thanh toán → mua).
- Cấu hình chung: thông tin ngân hàng, phí ship mặc định, SEO/meta, ảnh OG.

---

## 4. Thanh toán tự động qua SePay ★

### Luồng bắt buộc
```
1. Khách bấm mua → điền thông tin
2. Server tạo order, sinh mã đơn duy nhất (vd ZIZI7K3P)
3. Hiển thị VietQR: đúng số tiền + nội dung CK = mã đơn
4. Màn hình chờ, KHÔNG có nút "tôi đã chuyển khoản"
5. Khách chuyển khoản
6. SePay phát hiện tiền về → gọi webhook đến /api/webhooks/sepay
7. Server đối chiếu: nội dung CK chứa mã đơn + số tiền khớp
8. → order.status = 'paid'
   → tạo user (nếu chưa có) + tạo enrollment
   → gửi email tài khoản/link tải
   → bắn sự kiện Purchase
9. Trang khách đang mở tự nhận biết đã thanh toán → chuyển sang màn thành công
   (dùng Supabase Realtime subscribe theo order.id, hoặc polling 3 giây)
```

### Yêu cầu kỹ thuật webhook
- Endpoint: `POST /api/webhooks/sepay`
- **Xác thực chữ ký / API key** từ SePay trước khi xử lý. Từ chối request không hợp lệ.
- **Idempotent**: cùng một `sepay_txn_id` gửi lại nhiều lần chỉ xử lý một lần (tránh mở quyền/gửi mail trùng).
- Đối chiếu **cả nội dung chuyển khoản lẫn số tiền**. Lệch tiền → đánh dấu cần kiểm tra thủ công, không tự mở quyền.
- Ghi log mọi giao dịch để admin đối soát.
- Có màn hình trong admin xem log webhook và **xử lý tay các giao dịch lệch**.

> Lưu ý: kiểm tra tài liệu SePay mới nhất tại thời điểm code (định dạng payload, cách xác thực, cách sinh QR) vì có thể đã thay đổi.

---

## 5. Web bán hàng (public)

- **Mobile-first, khóa giao diện mobile**: toàn site hiển thị dạng một cột rộng tối đa ~460px, căn giữa trên màn hình lớn. (Riêng admin và khu vực học viên thì **responsive bình thường**.)
- Trang chủ: hero có mascot bé sâu ZiZi (SVG), dải cam kết, danh sách sản phẩm đang bán, khu đặt trước, đánh giá.
- Trang sản phẩm `/sp/[slug]`: render từ `landing_json`; ảnh bìa; giá + % giảm; cam kết hoàn tiền 24h; "bên trong có gì"; thanh mua cố định dưới đáy màn hình.
- Checkout 3 bước; **tài liệu có chọn bản mềm / bản cứng**, chọn bản cứng thì hiện ô địa chỉ + cộng phí ship.
- Màn thành công khác nhau: khóa học → "Vào học ngay"; tài liệu bản mềm → nút tải về; bản cứng → thông báo thời gian giao.
- SEO: meta + OG theo từng sản phẩm, sitemap.xml, dữ liệu có cấu trúc (schema.org Product/Course).

---

## 6. Khu vực học viên

- Đăng nhập bằng Supabase Auth (email + mật khẩu, nên có cả đăng nhập Google).
- Chỉ thấy khóa đã có `enrollment`. **Kiểm tra quyền phía máy chủ**, không chỉ ẩn ở giao diện.
- Trình phát video, danh sách buổi (đã học ✓ / đang học ▶ / khóa 🔒), thanh tiến độ %, tải tài nguyên từng buổi.
- Ghi nhận tiến độ tự động.

---

## 7. Bảo mật — BẮT BUỘC

1. **Không bao giờ gửi dữ liệu học viên/đơn hàng xuống trình duyệt người chưa đăng nhập.** Mọi truy vấn đi qua server (Server Components / Route Handlers).
2. **Bật Row Level Security (RLS)** trên tất cả bảng Supabase. Học viên chỉ đọc được dữ liệu của chính mình.
3. **Admin xác thực phía máy chủ**, kiểm tra role ở middleware. Không dùng mật khẩu nhúng trong JavaScript.
4. **Khóa API / token** (SePay, Supabase service key, FB CAPI, Resend) chỉ để trong biến môi trường phía server. Tuyệt đối không đưa vào code chạy ở trình duyệt.
5. **Video không cho tải trực tiếp**: dùng streaming có bảo vệ (khóa theo domain, hoặc DRM + watermark email học viên với VdoCipher).
6. **File tài liệu phát qua signed URL** hết hạn sau vài phút, không để link công khai vĩnh viễn.
7. Giới hạn số lần đăng nhập sai; log hoạt động admin.
8. Cấu hình **SPF/DKIM/DMARC** cho domain để email kích hoạt không vào Spam.

---

## 8. Thứ tự triển khai đề xuất

| Giai đoạn | Nội dung |
|---|---|
| 1 | Dựng database + Auth + RLS; import sản phẩm hiện có |
| 2 | Admin: CRUD sản phẩm + sắp xếp + quản lý bài học + upload |
| 3 | Web bán hàng public theo đúng giao diện file demo |
| 4 | Checkout + SePay webhook + email tự động |
| 5 | Khu vực học viên + tiến độ |
| 6 | Tracking pixel + báo cáo phễu |
| 7 | Đơn bản cứng: vận đơn, trạng thái giao hàng |

---

## 9. Dữ liệu khởi tạo

**Khóa học:** HSK1 (199.000₫), HSK2 (249.000₫), Combo HSK1+2 (399.000₫), Bộ thủ & Công thức (149.000₫).
**Đặt trước:** HSK3 1.000.000₫ · HSK4 1.500.000₫ · HSK5 2.500.000₫ · HSK6 3.500.000₫ (giá gốc = giá đặt trước × 1,45).

**Giáo trình HSK1 — 30 buổi:**
```
Buổi 1      Nhập môn tiếng Trung
Buổi 2–4    Thanh mẫu, vận mẫu, thanh điệu (phần 1–3)
Buổi 5      Bài 1  你好 — Xin chào
Buổi 6      Bài 2  汉语不太难 — Tiếng Hán không khó lắm
Buổi 7      Bài 3  明天见 — Ngày mai gặp lại
Buổi 8–9    Bài 4  你去哪儿 — Bạn đi đâu đấy
Buổi 10     Bài 5  这是王老师 — Đây là thầy giáo Vương
Buổi 11     Bài 6  我学习汉语 — Tôi học tiếng Hán
Buổi 12–13  Bài 7  你吃什么 — Bạn ăn gì
Buổi 14–15  Bài 8  苹果一斤多少钱 — Một cân táo bao nhiêu tiền
Buổi 16     Bài 9  我换人民币 — Tôi đổi tiền Nhân dân tệ
Buổi 17–18  Bài 10 他住哪儿 — Ông ấy sống ở đâu
Buổi 18–19  Bài 11 我们都是留学生 — Chúng tôi đều là lưu học sinh
Buổi 20     Luyện tập
Buổi 21–22  Bài 12 你在哪儿学习 — Bạn học ở đâu
Buổi 23–25  Bài 13 这是不是中药 — Đây có phải thuốc Đông y không
Buổi 26–28  Bài 14 你的车是新的还是旧的 — Xe của bạn mới hay cũ
Buổi 29–30  Bài 15 你们公司有多少职员 — Công ty có bao nhiêu nhân viên (+ Ôn tập)
```

**Thương hiệu:** ZiZi Chinese · mascot bé sâu xanh · màu chủ đạo xanh sage `#8CB86E`, nhấn hồng san hô `#E37765`, nền kem `#F6F9EE` (xem biến `@THEME` trong file demo).
