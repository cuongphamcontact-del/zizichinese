# ZiZi Chinese — Sơ đồ site & Bản đồ chỉnh sửa

> Mẹo dùng: mở file `tieng-trung-khoi-net.html`, bấm **Ctrl+F** (Cmd+F trên Mac) rồi gõ từ khóa `@…` ở cột "Tìm bằng" là nhảy đúng chỗ cần sửa.

---

## 1. Sơ đồ site (khách nhìn thấy gì)

```
zizichinese.com
│
├── / ................................ TRANG CHỦ
│   ├── Hero (bé sâu ZiZi + tiêu đề)
│   ├── Dải cam kết (3 ô: kích hoạt / hoàn tiền / hỗ trợ)
│   ├── #khoahoc ..................... Sản phẩm đang bán
│   ├── #nangcao ..................... Khóa đặt trước (HSK3–6)
│   └── #danhgia ..................... Đánh giá học viên
│
├── /sp/<slug> ....................... TRANG BÁN SẢN PHẨM
│   ├── Flash sale + đếm ngược
│   ├── Ảnh bìa / ký tự · giá · thanh "đã bán"
│   ├── Cam kết hoàn tiền 24h
│   ├── "Bên trong có gì"
│   └── [Nút mua] → Thanh toán
│
├── /thanh-toan ...................... THANH TOÁN (3 bước)
│   ├── ① Thông tin (+ chọn bản mềm/cứng nếu là tài liệu)
│   ├── ② Quét VietQR → hệ thống tự đối soát
│   └── ③ Thành công → vào học / tải tài liệu
│
├── /#tu-vung ....................... HỌC 5000 TỪ VỰNG HSK (người mua gói tai-lieu-5000-tu; khách: 20 từ học thử)
│   └── Thẻ nhớ · Luyện gõ · Danh sách · lịch ôn 1/3/7/14 ngày
│
├── /hoc ............................. KHU VỰC HỌC VIÊN  (cần đăng nhập)
│   ├── Trình phát video + tiến độ %
│   ├── Tài nguyên buổi học (PDF/audio/flashcard)
│   └── Danh sách buổi (đã học ✓ / đang học ▶ / khóa 🔒)
│
├── /#quantri ........................ QUẢN TRỊ  (ẩn, cần mật khẩu)
│   ├── Tổng quan ............ KPI · doanh thu 7 ngày · bán chạy
│   ├── Đơn hàng ............. lọc · thêm/sửa thủ công · Purchase
│   ├── Sản phẩm ............. CRUD · sắp xếp ▲▼ · quản lý bài học
│   ├── Học viên ............. tự động + thủ công
│   └── Tracking ............. Pixel FB/TikTok/GA4 · sự kiện
│
└── Chân trang ....................... Chính sách · liên hệ · pháp lý
```

**Vào admin:** thêm `#quantri` vào URL · mật khẩu demo `zizi2026` · phím tắt `Ctrl/Cmd + Shift + A`.

---

## 2. Bản đồ chỉnh sửa — "Tôi muốn sửa X thì vào đâu?"

### Nội dung bán hàng (hay sửa nhất)

| Muốn sửa | Cách nhanh nhất | Tìm bằng |
|---|---|---|
| Tên / giá / mô tả sản phẩm | **Admin → Sản phẩm → Sửa** | `@DATA-PRODUCTS` |
| Thứ tự sản phẩm hiện trên web | **Admin → Sản phẩm → ▲▼** | `@DATA-PRODUCTS` |
| Thêm / xóa sản phẩm | **Admin → + Thêm sản phẩm** | `@DATA-PRODUCTS` |
| Ẩn tạm 1 sản phẩm | Sửa → bỏ tick **Xuất bản** | — |
| Tên buổi học, gắn video, file bài tập | **Sửa khóa → 🎬 Quản lý bài học** | `@DATA-LESSONS` |
| Giáo trình HSK1 hiện trong khu vực học | Sửa trực tiếp trong file | `@MAP-LEARN` |
| Trang học 5000 từ vựng (giao diện, số từ học thử) | Sửa trong file; dữ liệu từ ở bảng `vocab_words` (Supabase) | `@MAP-VOCAB` |
| Mục "Bên trong có gì?" từng sản phẩm | Sửa trong file | `@DATA-WHATSIN` |

### Giao diện & thương hiệu

| Muốn sửa | Tìm bằng | Ghi chú |
|---|---|---|
| Màu sắc toàn site | `@THEME` | Sửa 1 chỗ → cả web đổi |
| Bé sâu ZiZi (hình dáng, màu) | `@MASCOT` | SVG, phóng to không vỡ |
| Tiêu đề lớn trang chủ | `@MAP-HOME` | Trong khối `.hero` |
| Menu trên cùng | `@MAP-HEADER` | |
| Chính sách, liên hệ, pháp lý | `@MAP-FOOTER` | Nhớ điền MST/địa chỉ thật |
| Đánh giá học viên | `@MAP-HOME` | Khối `#danhgia` |
| Chiều rộng cột mobile (460px) | `@THEME` (ngay dưới) | |

### Vận hành

| Muốn sửa | Tìm bằng |
|---|---|
| Số tài khoản ngân hàng, tên chủ TK | `@DATA-BANK` |
| Nội dung 3 bước thanh toán | `@MAP-CHECKOUT` |
| Mật khẩu admin | `@MAP-ADMIN` (tìm `zizi2026`) |
| Danh mục & topic tags | `@DATA-TAGS` |
| Học viên / đơn hàng mẫu | `@DATA-USERS` / `@DATA-ORDERS` |
| Pixel FB, TikTok, GA4 | **Admin → Tracking** |

---

## 3. Quy tắc vàng để đỡ mất thời gian

1. **Ưu tiên sửa trong Admin, không sửa code.** Sản phẩm, giá, thứ tự, bài học, video, học viên, đơn hàng — tất cả sửa được bằng giao diện.
2. **Chỉ đụng vào code khi** đổi màu, đổi chữ cố định (tiêu đề hero, footer, chính sách), hoặc đổi mascot.
3. **Sửa màu chỉ ở `@THEME`**, đừng sửa từng chỗ — hệ thống dùng biến màu chung.
4. **Trước khi sửa, copy file ra một bản dự phòng.** Đặt tên kiểu `zizi-2026-07-19.html`.

---

## 4. Lưu ý quan trọng về bản demo

File hiện tại là **một file HTML tĩnh**: giao diện và luồng chạy đúng, nhưng **dữ liệu chưa được lưu lại** — thêm sản phẩm hay gắn video xong, tải lại trang là về mặc định.

Để quản lý thật sự (như moneystudio.vn), cần nối vào hậu trường:

| Thành phần | Nhiệm vụ | Gợi ý |
|---|---|---|
| Database | Lưu sản phẩm, bài học, đơn, học viên | Supabase (Postgres) |
| Storage | Lưu ảnh bìa, video, PDF | Supabase Storage / Bunny / R2 |
| Auth | Đăng nhập admin & học viên | Supabase Auth |
| Thanh toán | Tự đối soát VietQR | Casso / Sepay / PayOS |
| Email | Gửi tài khoản & link tải | Resend / SendGrid |
| Hosting | Chạy web | Vercel / Netlify / Cloudflare |

File này đóng vai trò **bản thiết kế hoàn chỉnh** — đưa cho lập trình viên để họ nối dây vào Supabase, không phải thiết kế lại từ đầu.

---

## 5. Cấu trúc URL đề xuất khi lên thật

```
/                          Trang chủ
/khoa-hoc                  Danh sách khóa học
/tai-lieu                  Danh sách tài liệu / sách
/sp/khoa-hsk1              Trang bán (dùng slug trong admin)
/thanh-toan                Thanh toán
/hoc                       Khu vực học viên
/hoc/khoa-hsk1/buoi-5      Một buổi học cụ thể
/dang-nhap                 Đăng nhập
/chinh-sach/hoan-tien      Các trang chính sách
/quan-tri                  Admin (nên đặt subdomain riêng)
```

> Khuyến nghị: đặt admin ở **subdomain riêng** (ví dụ `admin.zizichinese.com`) với đăng nhập phía máy chủ, thay vì nằm chung file với web công khai.
