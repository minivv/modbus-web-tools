create table if not exists public.modbus_register_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_address integer not null default 0,
  point_count integer not null default 0,
  default_mode text not null,
  overrides jsonb not null default '{}'::jsonb,
  point_names jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists modbus_register_presets_name_key
  on public.modbus_register_presets (name);

revoke all on public.modbus_register_presets from anon, authenticated;
grant select, insert, update, delete on public.modbus_register_presets to service_role;
