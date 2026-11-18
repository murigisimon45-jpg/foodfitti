create table if not exists public.foodfitti_orders (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists public.foodfitti_settings (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists public.foodfitti_tracking (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists public.foodfitti_theme (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists public.foodfitti_admin (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.foodfitti_orders enable row level security;
alter table public.foodfitti_settings enable row level security;
alter table public.foodfitti_tracking enable row level security;
alter table public.foodfitti_theme enable row level security;
alter table public.foodfitti_admin enable row level security;

drop policy if exists "public all orders" on public.foodfitti_orders;
create policy "public all orders" on public.foodfitti_orders for all using (true) with check (true);
drop policy if exists "public all settings" on public.foodfitti_settings;
create policy "public all settings" on public.foodfitti_settings for all using (true) with check (true);
drop policy if exists "public all tracking" on public.foodfitti_tracking;
create policy "public all tracking" on public.foodfitti_tracking for all using (true) with check (true);
drop policy if exists "public all theme" on public.foodfitti_theme;
create policy "public all theme" on public.foodfitti_theme for all using (true) with check (true);
drop policy if exists "public all admin" on public.foodfitti_admin;
create policy "public all admin" on public.foodfitti_admin for all using (true) with check (true);

create index if not exists idx_orders_created on public.foodfitti_orders (created_at);
create index if not exists idx_tracking_created on public.foodfitti_tracking (created_at);
