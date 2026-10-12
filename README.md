# ZiZi Chinese 🐛

Website bán khóa học tiếng Trung & tài liệu — thương hiệu **ZiZi Chinese**.

Giao diện mobile-first, mascot bé sâu ZiZi, có trang bán hàng, khu vực học viên và trang quản trị.

## Trạng thái

Đây là **bản prototype giao diện** (một file HTML tĩnh): giao diện và các luồng (mua hàng, thanh toán mô phỏng, khu vực học, quản trị) chạy và bấm được đầy đủ, nhưng **dữ liệu chưa được lưu** — tải lại trang là về mặc định.

Để vận hành thật (lưu đơn hàng, học viên, thanh toán tự động), xem lộ trình trong `docs/spec-ky-thuat.md`.

## Chạy thử

Chỉ cần mở `index.html` bằng trình duyệt. Không cần cài đặt gì.

- Trang chủ mở mặc định (giao diện mobile).
- Vào **quản trị**: thêm `#quantri` vào cuối URL (ví dụ `.../index.html#quantri`), hoặc phím tắt `Ctrl/Cmd + Shift + A`. Mật khẩu **giữ riêng, không lưu trong repo công khai**.

## Cấu trúc

```
zizichinese/
├── index.html          # Toàn bộ website (1 file: HTML + CSS + JS)
├── README.md
├── .gitignore
├── docs/
│   ├── sitemap.md          # Sơ đồ site + bản đồ chỉnh sửa nhanh
│   ├── spec-ky-thuat.md    # Mô tả kỹ thuật để dựng bản thật (Supabase + SePay)
│   └── bao-mat-trien-khai.md # Checklist bảo mật: khóa bí mật, xác nhận email, HTTPS
├── scripts/check-secrets.sh  # Quét khóa bí mật (GitHub Action chạy mỗi lần push)
└── supabase/
    ├── schema.sql
    ├── config.toml         # Auth: bật xác nhận email; webhook không cần JWT
    └── functions/sepay-webhook/  # Edge Function phía máy chủ (giữ khóa SePay/service_role)
```

Trong `index.html` có sẵn "biển chỉ đường": bấm `Ctrl+F` tìm các nhãn `@THEME`, `@DATA-PRODUCTS`, `@MAP-HOME`, `@MASCOT`… để nhảy đúng chỗ cần sửa.

## Triển khai

- **Hosting thường (cPanel):** upload `index.html` vào `public_html`.
- **GitHub Pages:** Settings → Pages → chọn nhánh `main`, thư mục `/root` → web chạy tại `https://<user>.github.io/zizichinese/`.

## Lưu ý bảo mật

Mọi thứ trong file này chạy ở trình duyệt nên **ai cũng xem được mã nguồn**. Vì vậy repo này **không được** chứa: mật khẩu thật, khóa API/token, thông tin khách hàng thật, link file khóa học. Trang quản trị ở đây chỉ là lớp che cho bản demo — bản thật bắt buộc xác thực phía máy chủ.

Khóa SePay / `service_role` chỉ nằm trong Edge Function (`supabase/functions/`), đặt bằng `supabase secrets set`. Các bước bật xác nhận email và Enforce HTTPS: xem `docs/bao-mat-trien-khai.md`.

## Lộ trình

Bản vận hành thật: Next.js + Supabase (DB/Storage/Auth) + SePay (thanh toán tự động). Chi tiết trong `docs/spec-ky-thuat.md`.
