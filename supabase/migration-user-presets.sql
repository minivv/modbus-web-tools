-- 模板归属登录用户（在 Supabase SQL Editor 执行一次）
-- 前置：public.modbus_register_presets 已由 schema.sql 创建

-- 1) 增加归属列（指向 auth.users；用户删除时模板级联删除）
alter table public.modbus_register_presets
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2) 名称唯一性改为“每个用户内唯一”（允许不同用户同名模板）
drop index if exists public.modbus_register_presets_name_key;
create unique index if not exists modbus_register_presets_user_name_key
  on public.modbus_register_presets (user_id, name);

-- 3) 按用户查询加速
create index if not exists modbus_register_presets_user_id_idx
  on public.modbus_register_presets (user_id);

-- 4) 服务端 API 按 user_id 过滤/写入，行权限保持只给 service_role
revoke all on public.modbus_register_presets from anon, authenticated;
grant select, insert, update, delete on public.modbus_register_presets to service_role;
