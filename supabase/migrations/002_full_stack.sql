-- FacturePro additive full-stack migration.
-- Safe to run after supabase/schema.sql.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  detail text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.invoice_drafts enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

do $$ begin
  create policy "users manage own profile" on public.profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "members read drafts" on public.invoice_drafts for select using (public.is_organization_member(organization_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owners manage drafts" on public.invoice_drafts for all using (owner_id = auth.uid() and public.is_organization_editor(organization_id)) with check (owner_id = auth.uid() and public.is_organization_editor(organization_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "users read notifications" on public.notifications for select using (public.is_organization_member(organization_id) and (user_id is null or user_id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "users update notifications" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "members read activity" on public.activity_logs for select using (public.is_organization_member(organization_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "editors write activity" on public.activity_logs for insert with check (public.is_organization_member(organization_id) and user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['companies', 'customers', 'products', 'invoices', 'payments', 'notifications'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
