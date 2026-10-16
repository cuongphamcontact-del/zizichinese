-- =====================================================================
-- Sản phẩm "Trọn bộ 5000 từ vựng HSK": Excel tải về + Học online trên web.
-- Chạy 1 lần trong Supabase → SQL Editor. Chạy lại nhiều lần cũng an toàn.
-- DỮ LIỆU 5000 TỪ KHÔNG nằm trong repo công khai: nạp bằng các file
-- seed-vocab-HSK*.sql (gửi riêng cho chủ shop) SAU KHI chạy file này.
-- =====================================================================

-- 1) Cập nhật sản phẩm: bỏ bản cứng, đổi tên/mô tả
update products set
  name        = 'Trọn bộ 5000 từ vựng HSK (Excel + Học online)',
  level_label = 'Tài liệu · tự học',
  description = 'Học 5000 từ HSK1–6 ngay trên web: thẻ nhớ, luyện gõ chữ Hán, nghe phát âm, lịch ôn tự động. Kèm file Excel tải về để tự theo dõi tiến độ.',
  has_soft    = true,
  has_hard    = false,
  hard_price  = null,
  ship_fee    = null,
  res_count   = 2
where slug = 'tai-lieu-5000-tu';

-- 2) Từ vựng (chỉ người đã mua đọc được; 20 từ học thử thì ai cũng đọc được)
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

-- Ai đang sở hữu gói 5000 từ (còn hạn)? SECURITY DEFINER để policy gọn & nhanh.
create or replace function owns_vocab() returns boolean as $$
  select exists (
    select 1 from enrollments e
    join products p on p.id = e.product_id
    where e.user_id = auth.uid()
      and p.slug = 'tai-lieu-5000-tu'
      and (e.expires_at is null or e.expires_at > now())
  );
$$ language sql stable security definer;

drop policy if exists p_vocab_read on vocab_words;
create policy p_vocab_read on vocab_words
  for select using (is_preview = true or is_admin() or owns_vocab());
drop policy if exists p_vocab_admin_all on vocab_words;
create policy p_vocab_admin_all on vocab_words
  for all using (is_admin()) with check (is_admin());

-- 3) Tiến độ học từ vựng: mỗi học viên 1 dòng, tự đọc/ghi của mình
create table if not exists vocab_progress (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,   -- {"HSK1":{"爱":[box,dueDay]},…,"log":{…}}
  updated_at  timestamptz not null default now()
);
alter table vocab_progress enable row level security;
drop policy if exists p_vocab_progress_own on vocab_progress;
create policy p_vocab_progress_own on vocab_progress
  for all using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid());

grant select on vocab_words to anon, authenticated;
grant select, insert, update on vocab_progress to authenticated;

-- 4) File Excel giao cho người mua: thêm trong Admin → Sản phẩm → "Link tài liệu"
--    (KHÔNG ghi link vào repo công khai), ví dụ:
--    Excel 5000 từ vựng HSK | https://drive.google.com/...
