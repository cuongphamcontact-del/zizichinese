-- =====================================================================
-- ZiZi Chinese, Cấu trúc kho dữ liệu (Supabase / PostgreSQL)
-- GIAI ĐOẠN 1: bảng + bảo mật RLS + dữ liệu khởi tạo
--
-- CÁCH CHẠY:
--   1. Tạo project trên supabase.com (miễn phí).
--   2. Vào mục "SQL Editor" → New query → dán TOÀN BỘ file này → Run.
--   3. Chạy một lần là xong. Chạy lại cũng an toàn (dùng IF NOT EXISTS / ON CONFLICT).
--
-- Ghi chú bảo mật:
--   - KHÔNG để khóa bí mật (SePay key, service_role key, Resend key) trong
--     bảng này. Chúng chỉ nằm ở biến môi trường của Edge Function (phía máy chủ).
--   - Mọi bảng đều bật RLS. Khách chưa đăng nhập chỉ đọc được sản phẩm đã xuất bản.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- ENUM ----------
do $$ begin
  create type product_type as enum ('video','live','doc');
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_status as enum ('sale','preorder');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_variant as enum ('course','soft','hard');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('pending','paid','refunded','cancelled','review');
exception when duplicate_object then null; end $$;

do $$ begin
  create type data_source as enum ('auto','manual');
exception when duplicate_object then null; end $$;

-- ---------- updated_at tự động ----------
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ---------- PROFILES (học viên + admin) ----------
-- Gắn 1-1 với auth.users của Supabase Auth.
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'student',   -- 'student' | 'admin'
  full_name   text,
  email       text,
  phone       text,
  avatar_url  text,
  source      data_source not null default 'auto',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_profiles_updated on profiles;
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- Hàm kiểm tra admin (dùng trong mọi policy). SECURITY DEFINER để tránh đệ quy RLS.
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$ language sql stable security definer;

-- Tự tạo profile khi có user mới đăng ký
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
exception when others then
  return new;   -- không bao giờ chặn việc tạo user; hồ sơ bù sau nếu cần
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- PRODUCTS (khóa học video/trực tiếp + tài liệu) ----------
create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  type            product_type not null default 'video',
  name            text not null,
  slug            text unique not null,
  subtitle        text,
  description     text,
  char_icon       text,
  level_label     text,
  cover_url       text,
  gallery         jsonb default '[]'::jsonb,
  price           int not null default 0,
  original_price  int,
  status          product_status not null default 'sale',
  preorder_enabled bool not null default false,
  open_at         timestamptz,
  category        text,
  delivery_note   text,
  author          text,
  publisher       text,
  tags            text[] default '{}',
  related_ids     uuid[] default '{}',
  landing_json    jsonb,
  live_info       jsonb,                 -- {duration, perMonth, schedule, session, slot} cho type='live'
  published       bool not null default true,
  featured        bool not null default false,
  sort_order      int not null default 0,
  -- riêng type='doc'
  has_soft        bool default false,
  has_hard        bool default false,
  hard_price      int,
  ship_fee        int,
  -- số liệu hiển thị
  lessons_count   int default 0,
  res_count       int default 0,
  students_count  int default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
drop trigger if exists trg_products_updated on products;
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();
create index if not exists idx_products_sort on products(sort_order);
create index if not exists idx_products_published on products(published);

-- ---------- LESSONS (bài học của khóa) ----------
create table if not exists lessons (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products(id) on delete cascade,
  sort_order     int not null default 0,
  title          text not null,
  video_provider text default 'vimeo',   -- vimeo | bunny | vdocipher | upload
  video_id       text,
  duration_sec   int,
  is_preview     bool not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists idx_lessons_product on lessons(product_id, sort_order);

-- ---------- LESSON_FILES (tài nguyên từng buổi) ----------
create table if not exists lesson_files (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references lessons(id) on delete cascade,
  name        text,
  file_url    text,
  file_type   text,
  size_bytes  bigint,
  sort_order  int default 0
);

-- ---------- PRODUCT_FILES (file bán kèm của tài liệu) ----------
create table if not exists product_files (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  name        text,
  file_url    text,
  file_type   text,
  size_bytes  bigint,
  sort_order  int default 0
);

-- ---------- ORDERS (đơn hàng) ----------
create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,
  user_id          uuid references auth.users(id) on delete set null,
  customer_name    text,
  customer_email   text,
  customer_phone   text,
  product_id       uuid references products(id) on delete set null,
  variant          order_variant not null default 'course',
  amount           int not null default 0,
  ship_fee         int default 0,
  shipping_address text,
  channel          text,
  status           order_status not null default 'pending',
  source           data_source not null default 'auto',
  paid_at          timestamptz,
  sepay_txn_id     text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
drop trigger if exists trg_orders_updated on orders;
create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created on orders(created_at desc);
-- Giỏ hàng: 1 đơn có thể gồm nhiều sản phẩm. items = [{product_id, name, variant, price}]
alter table orders add column if not exists items jsonb default '[]'::jsonb;

-- ---------- ENROLLMENTS (ai được học gì) ----------
create table if not exists enrollments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  granted_by  text default 'purchase',    -- purchase | manual
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique(user_id, product_id)
);
create index if not exists idx_enroll_user on enrollments(user_id);

-- ---------- LESSON_PROGRESS ----------
create table if not exists lesson_progress (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  lesson_id       uuid not null references lessons(id) on delete cascade,
  completed       bool default false,
  seconds_watched int default 0,
  updated_at      timestamptz not null default now(),
  unique(user_id, lesson_id)
);

-- ---------- SETTINGS (cấu hình công khai, sửa trong admin) ----------
-- KHÔNG chứa bí mật. Chỉ: pixel id, ga4 id, thông tin ngân hàng hiển thị, meta/OG.
create table if not exists settings (
  key   text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_settings_updated on settings;
create trigger trg_settings_updated before update on settings
  for each row execute function set_updated_at();

-- ---------- SHIPMENTS (vận đơn bản cứng) ----------
create table if not exists shipments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  carrier       text,
  tracking_code text,
  status        text default 'pending',   -- pending|packing|shipped|delivered
  updated_at    timestamptz not null default now()
);

-- ---------- WEBHOOK_LOGS (log SePay để đối soát) ----------
create table if not exists webhook_logs (
  id           uuid primary key default gen_random_uuid(),
  provider     text default 'sepay',
  payload      jsonb,
  matched_order uuid references orders(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table profiles        enable row level security;
alter table products        enable row level security;
alter table lessons         enable row level security;
alter table lesson_files    enable row level security;
alter table product_files   enable row level security;
alter table orders          enable row level security;
alter table enrollments     enable row level security;
alter table lesson_progress enable row level security;
alter table settings        enable row level security;
alter table shipments       enable row level security;
alter table webhook_logs    enable row level security;

-- PROFILES: tự đọc/sửa hồ sơ mình; admin toàn quyền
drop policy if exists p_profiles_self on profiles;
create policy p_profiles_self on profiles
  for select using (id = auth.uid() or is_admin());
drop policy if exists p_profiles_update_self on profiles;
create policy p_profiles_update_self on profiles
  for update using (id = auth.uid() or is_admin());
drop policy if exists p_profiles_admin_all on profiles;
create policy p_profiles_admin_all on profiles
  for all using (is_admin()) with check (is_admin());

-- PRODUCTS: ai cũng đọc sản phẩm đã xuất bản; admin toàn quyền
drop policy if exists p_products_public_read on products;
create policy p_products_public_read on products
  for select using (published = true or is_admin());
drop policy if exists p_products_admin_all on products;
create policy p_products_admin_all on products
  for all using (is_admin()) with check (is_admin());

-- LESSONS: xem được nếu là buổi học thử, hoặc đã sở hữu khóa, hoặc admin
drop policy if exists p_lessons_read on lessons;
create policy p_lessons_read on lessons
  for select using (
    is_admin()
    or is_preview = true
    or exists (
      select 1 from enrollments e
      where e.user_id = auth.uid() and e.product_id = lessons.product_id
    )
  );
drop policy if exists p_lessons_admin_all on lessons;
create policy p_lessons_admin_all on lessons
  for all using (is_admin()) with check (is_admin());

-- LESSON_FILES: theo quyền của bài học cha
drop policy if exists p_lesson_files_read on lesson_files;
create policy p_lesson_files_read on lesson_files
  for select using (
    is_admin()
    or exists (
      select 1 from lessons l
      join enrollments e on e.product_id = l.product_id and e.user_id = auth.uid()
      where l.id = lesson_files.lesson_id
    )
  );
drop policy if exists p_lesson_files_admin_all on lesson_files;
create policy p_lesson_files_admin_all on lesson_files
  for all using (is_admin()) with check (is_admin());

-- PRODUCT_FILES: chỉ người đã mua tài liệu, hoặc admin
drop policy if exists p_product_files_read on product_files;
create policy p_product_files_read on product_files
  for select using (
    is_admin()
    or exists (
      select 1 from enrollments e
      where e.user_id = auth.uid() and e.product_id = product_files.product_id
    )
  );
drop policy if exists p_product_files_admin_all on product_files;
create policy p_product_files_admin_all on product_files
  for all using (is_admin()) with check (is_admin());

-- ORDERS: khách xem đơn của mình; tạo/sửa chủ yếu qua Edge Function (service role,
-- vốn bỏ qua RLS). Admin toàn quyền.
drop policy if exists p_orders_own on orders;
create policy p_orders_own on orders
  for select using (user_id = auth.uid() or is_admin());
drop policy if exists p_orders_admin_all on orders;
create policy p_orders_admin_all on orders
  for all using (is_admin()) with check (is_admin());

-- ENROLLMENTS: khách xem quyền của mình; admin toàn quyền
drop policy if exists p_enroll_own on enrollments;
create policy p_enroll_own on enrollments
  for select using (user_id = auth.uid() or is_admin());
drop policy if exists p_enroll_admin_all on enrollments;
create policy p_enroll_admin_all on enrollments
  for all using (is_admin()) with check (is_admin());

-- LESSON_PROGRESS: khách tự quản tiến độ của mình; admin xem được
drop policy if exists p_progress_own on lesson_progress;
create policy p_progress_own on lesson_progress
  for all using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

-- SETTINGS: ai cũng đọc (không chứa bí mật); chỉ admin ghi
drop policy if exists p_settings_read on settings;
create policy p_settings_read on settings for select using (true);
drop policy if exists p_settings_admin_write on settings;
create policy p_settings_admin_write on settings
  for all using (is_admin()) with check (is_admin());

-- SHIPMENTS & WEBHOOK_LOGS: chỉ admin
drop policy if exists p_shipments_admin on shipments;
create policy p_shipments_admin on shipments
  for all using (is_admin()) with check (is_admin());
drop policy if exists p_weblogs_admin on webhook_logs;
create policy p_weblogs_admin on webhook_logs
  for all using (is_admin()) with check (is_admin());

-- =====================================================================
-- DỮ LIỆU KHỞI TẠO, 11 sản phẩm hiện có
-- =====================================================================
insert into products (slug,type,name,char_icon,level_label,description,price,original_price,status,preorder_enabled,featured,sort_order,lessons_count,res_count,students_count,has_soft,has_hard,hard_price,ship_fee,live_info) values
('hsk1','video','Khóa HSK1','一','HSK 1 · mất gốc','Đặt nền phát âm pinyin chuẩn và 150 từ vựng đầu tiên để nghe – nói được câu cơ bản.',199000,399000,'sale',false,false,10,30,86,1204,false,false,null,null,null),
('hsk2','video','Khóa HSK2','二','HSK 2 · nền tảng','Mở rộng lên 300 từ và ngữ pháp nền tảng để nói câu dài, tự tin giao tiếp hằng ngày.',249000,449000,'sale',false,false,20,30,102,642,false,false,null,null,null),
('combo','video','Combo HSK1+2','中','Trọn lộ trình 0 → HSK2','Cả hai khóa gộp thành một lộ trình liền mạch, kèm quà tặng luyện thi.',399000,848000,'sale',false,true,30,60,188,512,false,false,null,null,null),
('bo-thu','video','Bộ thủ & Công thức tiếng Trung','部','Nền gốc · học kèm mọi cấp','214 bộ thủ + công thức chiết tự giúp đoán nghĩa, nhớ mặt chữ mà không cần học thuộc lòng.',149000,299000,'sale',false,false,40,18,60,918,false,false,null,null,null),
('hsk1-truc-tiep','live','HSK1 trực tiếp với giáo viên, Tiếng Trung cho người mới bắt đầu','一','Trực tiếp · HSK1 · người mới','Lớp học online trực tiếp cùng giáo viên qua Zoom, lớp nhỏ, chữa phát âm 1-1, có ghi hình xem lại.',1200000,null,'sale',false,false,50,30,20,86,false,false,null,null,'{"duration":"~2,5 tháng","perMonth":"480.000₫/tháng","schedule":"Thứ 2-4-6 hoặc 3-5-7","session":"60 phút/buổi","slot":"Buổi tối 21h–22h"}'),
('hsk2-truc-tiep','live','HSK2 trực tiếp, Nâng cao nền tảng tiếng Trung','二','Trực tiếp · HSK2 · nâng cao','Lớp trực tiếp nâng cao nền tảng: mở rộng từ vựng và ngữ pháp HSK2, luyện nói theo chủ đề.',1700000,null,'sale',false,false,60,30,20,42,false,false,null,null,'{"duration":"2,5 tháng (tạm tính)","perMonth":"680.000₫/tháng","schedule":"Thứ 2-4-6 hoặc 3-5-7","session":"60 phút/buổi","slot":"Buổi tối 21h–22h"}'),
('tai-lieu-5000-tu','doc','5000 từ vựng HSK – Bản Excel','册','Tài liệu · 5000 từ HSK1–6','File Excel 5000 từ HSK1–6: pinyin, nghĩa, câu ví dụ có dịch; tự gõ lại và chấm ✓/✗, lịch ôn tự tính. Tải về dùng trên máy tính và điện thoại.',49000,99000,'sale',false,false,70,0,1,340,true,false,null,null,null),
('hoc-5000-tu-online','doc','5000 từ vựng HSK – Học trên web','词','Học online · 5000 từ HSK1–6','Học 5000 từ HSK1–6 ngay trên zizichinese.com: thẻ nhớ, luyện gõ chữ Hán, nghe phát âm, lịch ôn tự động. Tiến độ lưu theo tài khoản, đổi máy vẫn còn.',99000,199000,'sale',false,false,71,0,0,0,true,false,null,null,null),
('hsk3','video','Khóa HSK3','三','HSK 3 · trung cấp','600 từ vựng và ngữ pháp trung cấp, đọc hiểu đoạn văn, giao tiếp trôi chảy các chủ đề đời sống.',1000000,1450000,'preorder',true,false,80,36,120,128,false,false,null,null,null),
('hsk4','video','Khóa HSK4','四','HSK 4 · trung–cao','1.200 từ, xử lý văn bản dài và diễn đạt quan điểm. Bước đệm vững vào trình độ cao cấp.',1500000,2175000,'preorder',true,false,90,40,134,74,false,false,null,null,null),
('hsk5','video','Khóa HSK5','五','HSK 5 · cao cấp','2.500 từ, đọc báo, xem phim không phụ đề, viết luận. Trình độ cao cấp thực thụ.',2500000,3625000,'preorder',true,false,100,44,150,41,false,false,null,null,null),
('hsk6','video','Khóa HSK6','六','HSK 6 · thành thạo','5.000+ từ, thành thạo gần như bản ngữ. Chinh phục mốc HSK cao nhất và tấm bằng danh giá.',3500000,5075000,'preorder',true,false,110,48,168,33,false,false,null,null,null)
on conflict (slug) do nothing;

-- Cấu hình mặc định (sửa lại trong admin / SQL khi có số thật)
insert into settings (key,value) values
('bank_info','{"bank":"","account_no":"","account_name":"ZIZI CHINESE"}'),
('site_meta','{"title":"ZiZi Chinese, Tự học tiếng Trung từ 0 đến HSK6","description":"Học tiếng Trung dễ hiểu, lên trình từ con số 0","og_image":"/assets/zizi-logo.png"}'),
('pixels','{"fb_pixel_id":"","tiktok_pixel_id":"","ga4_id":""}'),
('events_enabled','{"pageview":true,"viewcontent":true,"initiatecheckout":true,"lead":true,"purchase":true}'),
('shipping_default_fee','30000')
on conflict (key) do nothing;

-- =====================================================================
-- BẢO MẬT BỔ SUNG (chạy sau khi đã có bucket "covers")
-- =====================================================================

-- 1) CHẶN TỰ NÂNG QUYỀN: người thường KHÔNG được tự đổi role thành admin.
--    (Nếu không có, học viên đăng nhập có thể tự set role='admin'.)
create or replace function protect_profile_role() returns trigger as $$
begin
  if not is_admin() then
    new.role := old.role;   -- bỏ qua mọi thay đổi role từ người không phải admin
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_protect_role on profiles;
create trigger trg_protect_role before update on profiles
  for each row execute function protect_profile_role();

-- 2) QUY TẮC KHO ẢNH "covers": ai cũng XEM được, chỉ admin TẢI LÊN/SỬA/XÓA.
--    (Cần bucket "covers" đã tạo. Nếu chưa có write policy, admin cũng không upload được.)
drop policy if exists "covers public read" on storage.objects;
create policy "covers public read" on storage.objects
  for select using (bucket_id = 'covers');
drop policy if exists "covers admin insert" on storage.objects;
create policy "covers admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'covers' and is_admin());
drop policy if exists "covers admin update" on storage.objects;
create policy "covers admin update" on storage.objects
  for update to authenticated using (bucket_id = 'covers' and is_admin());
drop policy if exists "covers admin delete" on storage.objects;
create policy "covers admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'covers' and is_admin());

-- =====================================================================
-- MÃ GIẢM GIÁ (coupons), chạy khối này để bật tính năng giảm giá
-- =====================================================================
create table if not exists discounts (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,          -- nhập không phân biệt hoa thường (lưu IN HOA)
  kind        text not null default 'percent',-- 'percent' (%) | 'amount' (đ)
  value       int  not null default 0,        -- % (1-100) hoặc số tiền (đ)
  min_amount  int  default 0,                 -- đơn tối thiểu để áp mã
  max_uses    int,                            -- null = không giới hạn lượt
  used_count  int  not null default 0,
  expires_at  timestamptz,                    -- null = không hết hạn
  active      bool not null default true,
  created_at  timestamptz not null default now()
);
alter table discounts enable row level security;
drop policy if exists p_disc_admin on discounts;
create policy p_disc_admin on discounts for all using (is_admin()) with check (is_admin());
-- Cho khách ĐỌC mã đang bật để xem trước mức giảm ở trang thanh toán.
-- (Số tiền thật vẫn được tính lại phía máy chủ trong create-order nên không gian lận được.)
drop policy if exists p_disc_read_active on discounts;
create policy p_disc_read_active on discounts for select using (active = true);

-- =====================================================================
-- XONG.
-- =====================================================================
