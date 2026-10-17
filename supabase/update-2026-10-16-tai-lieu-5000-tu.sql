-- =====================================================================
-- Gói "5000 từ vựng HSK": 2 lựa chọn bán riêng
--   • tai-lieu-5000-tu    → Bản Excel (tải file)          49.000đ
--   • hoc-5000-tu-online  → Học trên web (thẻ nhớ, lịch ôn) 99.000đ
-- Chạy trong Supabase → SQL Editor. Chạy lại nhiều lần vẫn an toàn.
-- DỮ LIỆU 5000 TỪ KHÔNG nằm trong repo công khai: nạp bằng các file
-- seed-vocab-HSK*.sql (gửi riêng cho chủ shop) SAU KHI chạy file này.
-- =====================================================================

-- 1) Bản Excel: bỏ bản cứng/PDF
update products set
  name           = '5000 từ vựng HSK – Bản Excel',
  level_label    = 'Tài liệu · 5000 từ HSK1–6',
  description    = 'File Excel 5000 từ HSK1–6: pinyin, nghĩa, câu ví dụ có dịch; tự gõ lại và chấm ✓/✗, lịch ôn tự tính. Tải về dùng trên máy tính và điện thoại.',
  price          = 49000,
  original_price = 99000,
  has_soft       = true,
  has_hard       = false,
  hard_price     = null,
  ship_fee       = null,
  res_count      = 1
where slug = 'tai-lieu-5000-tu';

-- 2) Bản học trên web (sản phẩm mới, cùng ảnh bìa)
insert into products (slug,type,name,char_icon,level_label,description,price,original_price,status,preorder_enabled,featured,sort_order,lessons_count,res_count,students_count,has_soft,has_hard,hard_price,ship_fee,live_info,cover_url)
select 'hoc-5000-tu-online','doc','5000 từ vựng HSK – Học trên web','词','Học online · 5000 từ HSK1–6',
       'Học 5000 từ HSK1–6 ngay trên zizichinese.com: thẻ nhớ, luyện gõ chữ Hán, nghe phát âm, lịch ôn tự động. Tiến độ lưu theo tài khoản, đổi máy vẫn còn.',
       99000,199000,'sale',false,false,71,0,0,0,true,false,null,null,null,
       (select cover_url from products where slug='tai-lieu-5000-tu')
on conflict (slug) do update set
  name=excluded.name, level_label=excluded.level_label, description=excluded.description,
  price=excluded.price, original_price=excluded.original_price, has_hard=false;

-- 3) Từ vựng (chỉ người mua bản Học trên web đọc được; 20 từ học thử thì ai cũng đọc được)
create table if not exists vocab_words (
  id          bigint generated always as identity primary key,
  level       text not null,            -- 'HSK1' … 'HSK6'
  idx         int  not null,            -- thứ tự trong cấp, bắt đầu từ 1
  word        text not null,
  pinyin      text,
  meaning     text,
  example     text,
  example_py  text,
  example_vi  text,
  note        text,
  is_preview  bool not null default false,
  unique(level, idx)
);
create index if not exists idx_vocab_level on vocab_words(level, idx);
alter table vocab_words enable row level security;

create or replace function owns_vocab() returns boolean as $$
  select exists (
    select 1 from enrollments e
    join products p on p.id = e.product_id
    where e.user_id = auth.uid()
      and p.slug = 'hoc-5000-tu-online'
      and (e.expires_at is null or e.expires_at > now())
  );
$$ language sql stable security definer;

drop policy if exists p_vocab_read on vocab_words;
create policy p_vocab_read on vocab_words
  for select using (is_preview = true or is_admin() or owns_vocab());
drop policy if exists p_vocab_admin_all on vocab_words;
create policy p_vocab_admin_all on vocab_words
  for all using (is_admin()) with check (is_admin());

-- 4) Tiến độ học: mỗi học viên 1 dòng, tự đọc/ghi của mình
create table if not exists vocab_progress (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table vocab_progress enable row level security;
drop policy if exists p_vocab_progress_own on vocab_progress;
create policy p_vocab_progress_own on vocab_progress
  for all using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid());

grant select on vocab_words to anon, authenticated;
grant select, insert, update on vocab_progress to authenticated;

-- 5) File Excel giao cho người mua bản Excel: Admin → Sản phẩm → "5000 từ vựng HSK – Bản Excel"
--    → ô "Link tài liệu" (KHÔNG ghi link vào repo công khai), ví dụ:
--    Excel 5000 từ vựng HSK | https://drive.google.com/...
