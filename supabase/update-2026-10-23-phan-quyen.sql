-- =====================================================================
-- Phân quyền nhân viên hỗ trợ (role 'staff' + cột perms)
-- Chạy 1 lần trong Supabase → SQL Editor. Chạy lại nhiều lần vẫn an toàn.
-- Mô hình: CHỦ = role 'admin' (toàn quyền, được phân quyền người khác).
--          NHÂN VIÊN = role 'staff' + perms (danh sách phần được xem/sửa).
--  Lưu ý: ở tầng dữ liệu, nhân viên có quyền thao tác các bảng quản trị
--  như admin; giao diện sẽ ẩn phần không được cấp. Chỉ cấp cho người tin cậy.
-- =====================================================================

-- 1) Cột perms (danh sách quyền dạng JSON)
alter table profiles add column if not exists perms jsonb not null default '[]'::jsonb;

-- 2) is_owner(): chỉ CHỦ (toàn quyền) — dùng cho việc sửa hồ sơ/phân quyền
create or replace function is_owner() returns boolean as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin');
$$ language sql stable security definer;

-- 3) is_admin(): CHỦ hoặc NHÂN VIÊN — dùng cho các bảng quản trị chung
create or replace function is_admin() returns boolean as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','staff'));
$$ language sql stable security definer;

-- 4) Chỉ CHỦ được sửa hồ sơ & phân quyền; nhân viên chỉ được xem danh sách
drop policy if exists p_profiles_admin_all on profiles;
drop policy if exists p_profiles_owner_all on profiles;
create policy p_profiles_owner_all on profiles
  for all using (is_owner()) with check (is_owner());
drop policy if exists p_profiles_staff_read on profiles;
create policy p_profiles_staff_read on profiles
  for select using (is_admin());

-- Xong. Các bảng khác (products, orders, enrollments, lessons, settings…)
-- vẫn dùng is_admin() nên nhân viên thao tác được; giao diện lọc theo perms.
