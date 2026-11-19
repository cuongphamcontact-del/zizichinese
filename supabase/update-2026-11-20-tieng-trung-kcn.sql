-- =====================================================================
-- Sản phẩm "Tiếng Trung Khu Công Nghiệp" (học trên web) — danh mục Tài liệu tự học
--   slug: tieng-trung-khu-cong-nghiep · 179.000đ (gạch 300.000đ)
--   Trang học: https://zizichinese.com/tieng-trung-khu-cong-nghiep/
-- Chạy trong Supabase → SQL Editor. Chạy lại nhiều lần vẫn an toàn.
-- NỘI DUNG BÀI HỌC KHÔNG nằm trong repo công khai: nạp bằng file
-- seed-tieng-trung-kcn.sql (gửi riêng cho chủ shop) SAU KHI chạy file này.
-- =====================================================================

-- 1) Sản phẩm
insert into products (slug,type,name,char_icon,level_label,subtitle,description,price,original_price,status,preorder_enabled,featured,sort_order,lessons_count,res_count,students_count,has_soft,has_hard,hard_price,ship_fee,cover_url,tags)
values ('tieng-trung-khu-cong-nghiep','doc','Tiếng Trung Khu Công Nghiệp','厂','Khoá học online · 13 bài công xưởng',
 'Tiếng Trung cho công nhân, tổ trưởng, QC, kho, kỹ thuật ở khu công nghiệp',
 'Học tiếng Trung đúng việc ở xưởng: xin nghỉ, hỏi tăng ca, báo máy hỏng, báo sản lượng, kiểm hàng QC, nhập xuất kho và đóng gói. 13 bài cho công nhân, tổ trưởng, QC, kho và kỹ thuật ở khu công nghiệp, có hội thoại nhập vai và lộ trình theo vị trí. Bấm loa là nghe, không cần biết chữ trước. Học ngay trên điện thoại sau khi thanh toán.',
 179000,300000,'sale',false,false,72,13,0,0,true,false,null,null,'https://zizichinese.com/assets/cover-tieng-trung-kcn.jpg',
 array['khu công nghiệp','công xưởng','học online'])
on conflict (slug) do update set
  name=excluded.name, level_label=excluded.level_label, subtitle=excluded.subtitle, description=excluded.description,
  price=excluded.price, original_price=excluded.original_price, lessons_count=excluded.lessons_count,
  cover_url=excluded.cover_url, has_soft=true, has_hard=false, published=true;

-- 2) Nội dung bài học: catalog + học thử ai cũng đọc; 13 bài đầy đủ chỉ người đã mua đọc được
create table if not exists kcn_lessons (
  id          text primary key,      -- 'catalog' | 'preview-1' | '1'…'13'
  sort        int  not null default 0,
  is_preview  bool not null default false,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table kcn_lessons enable row level security;

create or replace function owns_kcn() returns boolean as $$
  select exists (
    select 1 from enrollments e
    join products p on p.id = e.product_id
    where e.user_id = auth.uid()
      and p.slug = 'tieng-trung-khu-cong-nghiep'
      and (e.expires_at is null or e.expires_at > now())
  );
$$ language sql stable security definer;

drop policy if exists p_kcn_read on kcn_lessons;
create policy p_kcn_read on kcn_lessons
  for select using (is_preview = true or is_admin() or owns_kcn());
drop policy if exists p_kcn_admin_all on kcn_lessons;
create policy p_kcn_admin_all on kcn_lessons
  for all using (is_admin()) with check (is_admin());
