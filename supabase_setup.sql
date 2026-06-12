-- ============================================================
--  PPM Air Compressor — Supabase Database Setup (v2)
--  วิธีใช้: วางทั้งหมดใน Supabase SQL Editor แล้วกด Run
-- ============================================================

-- 1. ตาราง machines
create table if not exists machines (
  id          serial primary key,
  machine_id  text not null unique,
  name        text,
  location    text,
  created_at  timestamptz default now()
);

insert into machines (machine_id, name) values
  ('AC-01', 'Air Compressor 01'),
  ('AC-02', 'Air Compressor 02'),
  ('AC-05', 'Air Compressor 05'),
  ('AC-06', 'Air Compressor 06'),
  ('AC-07', 'Air Compressor 07'),
  ('AC-08', 'Air Compressor 08')
on conflict (machine_id) do nothing;

-- 2. ตาราง inspectors
create table if not exists inspectors (
  id         serial primary key,
  name       text not null unique,
  created_at timestamptz default now()
);

-- 3. ตาราง ppm_records
create table if not exists ppm_records (
  id                    serial primary key,
  created_at            timestamptz default now(),
  machine_id            int references machines(id) on delete set null,
  machine_label         text,
  inspector_id          int references inspectors(id) on delete set null,
  inspector_name        text,
  pressure_load_unload  text,
  temperature           text,
  pressure_oil_sep      text,
  motor_current         text,
  fan_motor_current     text,
  oil_level             text,
  running_hours         numeric,
  area_cleaning         text,
  remarks               text,
  status                text default 'รอ Approve',
  approver_name         text,
  approved_at           timestamptz
);

-- 4. ตาราง record_custom_items
create table if not exists record_custom_items (
  id         serial primary key,
  record_id  int not null references ppm_records(id) on delete cascade,
  item_name  text not null,
  value      text
);

-- ============================================================
--  Row Level Security
-- ============================================================

alter table machines             enable row level security;
alter table inspectors           enable row level security;
alter table ppm_records          enable row level security;
alter table record_custom_items  enable row level security;

-- ลบ policy เก่าก่อน (ป้องกัน "already exists")
drop policy if exists "allow_all_machines"       on machines;
drop policy if exists "allow_all_inspectors"     on inspectors;
drop policy if exists "allow_all_ppm_records"    on ppm_records;
drop policy if exists "allow_all_custom_items"   on record_custom_items;

-- สร้าง policy ใหม่
create policy "allow_all_machines"     on machines            for all using (true) with check (true);
create policy "allow_all_inspectors"   on inspectors          for all using (true) with check (true);
create policy "allow_all_ppm_records"  on ppm_records         for all using (true) with check (true);
create policy "allow_all_custom_items" on record_custom_items for all using (true) with check (true);

-- ============================================================
--  View: v_ppm_records_full
-- ============================================================

drop view if exists v_ppm_records_full;

create view v_ppm_records_full as
select
  r.id,
  r.created_at,
  m.machine_id,
  r.machine_label,
  i.name            as inspector,
  r.pressure_load_unload,
  r.temperature,
  r.pressure_oil_sep,
  r.motor_current,
  r.fan_motor_current,
  r.oil_level,
  r.running_hours,
  r.area_cleaning,
  r.remarks,
  r.status,
  r.approver_name,
  r.approved_at
from ppm_records r
left join machines   m on m.id = r.machine_id
left join inspectors i on i.id = r.inspector_id;
