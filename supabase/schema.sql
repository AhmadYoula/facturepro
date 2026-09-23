-- FacturePro initial Supabase schema.
-- Run this script once in the Supabase SQL Editor before enabling Supabase auth in the UI.

create extension if not exists pgcrypto;

create type public.membership_role as enum ('owner', 'admin', 'billing', 'viewer');
create type public.invoice_workflow_status as enum ('draft', 'issued', 'sent');
create type public.payment_method as enum ('cash', 'orange_money', 'mtn_momo', 'bank_transfer');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  updated_at timestamptz not null default now()
);

create table public.companies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  name text not null,
  legal_name text not null,
  legal_form text,
  registration_country text,
  nif text not null default '',
  rccm text not null default '',
  address text not null default '',
  city text,
  region text,
  postal_code text,
  phone text not null default '',
  billing_phone text,
  email text not null default '',
  billing_email text,
  website text,
  country_code text,
  currency_code text not null default 'GNF',
  locale text not null default 'fr-GN',
  invoice_template text not null default 'modern' check (invoice_template in ('classic', 'modern', 'minimal', 'bold', 'elegant')),
  default_vat_rate_bp integer not null default 1800 check (default_vat_rate_bp between 0 and 10000),
  payment_instructions text,
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  kind text not null check (kind in ('individual', 'business')),
  created_at timestamptz not null default now()
);
create index customers_organization_name_idx on public.customers(organization_id, name);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  vat_rate_bp integer not null check (vat_rate_bp between 0 and 10000),
  unit text not null default 'unité',
  created_at timestamptz not null default now()
);
create index products_organization_name_idx on public.products(organization_id, name);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number text not null,
  workflow_status public.invoice_workflow_status not null default 'issued',
  sent_at timestamptz,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  customer_address text,
  issue_date date not null,
  due_date date not null,
  notes text,
  total_ttc_minor bigint not null check (total_ttc_minor >= 0),
  amount_paid_minor bigint not null default 0 check (amount_paid_minor >= 0),
  amount_credited_minor bigint not null default 0 check (amount_credited_minor >= 0),
  issued_at timestamptz not null default now(),
  unique (organization_id, number),
  check (amount_paid_minor + amount_credited_minor <= total_ttc_minor)
);
create index invoices_organization_issued_at_idx on public.invoices(organization_id, issued_at desc);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  position integer not null check (position >= 0),
  description text not null,
  quantity_milli bigint not null check (quantity_milli > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  vat_rate_bp integer not null check (vat_rate_bp between 0 and 10000),
  unique (invoice_id, position)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  method public.payment_method not null,
  paid_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index payments_organization_created_at_idx on public.payments(organization_id, created_at desc);

create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  created_at timestamptz not null default now()
);

create table public.invoice_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  detail text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index invoice_drafts_organization_updated_idx on public.invoice_drafts(organization_id, updated_at desc);
create index notifications_organization_created_idx on public.notifications(organization_id, created_at desc);
create index activity_logs_organization_created_idx on public.activity_logs(organization_id, created_at desc);

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_organization_editor(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'billing')
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.companies enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;
alter table public.credit_notes enable row level security;
alter table public.profiles enable row level security;
alter table public.invoice_drafts enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

create policy "users manage own profile" on public.profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members can read organizations" on public.organizations for select using (public.is_organization_member(id));
create policy "editors can update organizations" on public.organizations for update using (public.is_organization_editor(id)) with check (public.is_organization_editor(id));

create policy "members can read memberships" on public.organization_members for select using (public.is_organization_member(organization_id));
create policy "admins manage memberships" on public.organization_members for all using (public.is_organization_editor(organization_id)) with check (public.is_organization_editor(organization_id));

create policy "members read company" on public.companies for select using (public.is_organization_member(organization_id));
create policy "editors manage company" on public.companies for all using (public.is_organization_editor(organization_id)) with check (public.is_organization_editor(organization_id));
create policy "members read customers" on public.customers for select using (public.is_organization_member(organization_id));
create policy "editors manage customers" on public.customers for all using (public.is_organization_editor(organization_id)) with check (public.is_organization_editor(organization_id));
create policy "members read products" on public.products for select using (public.is_organization_member(organization_id));
create policy "editors manage products" on public.products for all using (public.is_organization_editor(organization_id)) with check (public.is_organization_editor(organization_id));
create policy "members read invoices" on public.invoices for select using (public.is_organization_member(organization_id));
create policy "editors manage invoices" on public.invoices for all using (public.is_organization_editor(organization_id)) with check (public.is_organization_editor(organization_id));
create policy "members read invoice lines" on public.invoice_lines for select using (exists (select 1 from public.invoices where invoices.id = invoice_lines.invoice_id and public.is_organization_member(invoices.organization_id)));
create policy "editors manage invoice lines" on public.invoice_lines for all using (exists (select 1 from public.invoices where invoices.id = invoice_lines.invoice_id and public.is_organization_editor(invoices.organization_id))) with check (exists (select 1 from public.invoices where invoices.id = invoice_lines.invoice_id and public.is_organization_editor(invoices.organization_id)));
create policy "members read payments" on public.payments for select using (public.is_organization_member(organization_id));
create policy "editors manage payments" on public.payments for all using (public.is_organization_editor(organization_id)) with check (public.is_organization_editor(organization_id));
create policy "members read credit notes" on public.credit_notes for select using (public.is_organization_member(organization_id));
create policy "editors manage credit notes" on public.credit_notes for all using (public.is_organization_editor(organization_id)) with check (public.is_organization_editor(organization_id));
create policy "members read drafts" on public.invoice_drafts for select using (public.is_organization_member(organization_id));
create policy "owners manage drafts" on public.invoice_drafts for all using (owner_id = auth.uid() and public.is_organization_editor(organization_id)) with check (owner_id = auth.uid() and public.is_organization_editor(organization_id));
create policy "users read notifications" on public.notifications for select using (public.is_organization_member(organization_id) and (user_id is null or user_id = auth.uid()));
create policy "users update notifications" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "members read activity" on public.activity_logs for select using (public.is_organization_member(organization_id));
create policy "editors write activity" on public.activity_logs for insert with check (public.is_organization_member(organization_id) and user_id = auth.uid());

create or replace function public.create_organization_with_owner(organization_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_organization_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.organizations(name) values (organization_name) returning id into new_organization_id;
  insert into public.organization_members(organization_id, user_id, role) values (new_organization_id, auth.uid(), 'owner');
  insert into public.companies(organization_id, name, legal_name) values (new_organization_id, organization_name, organization_name);
  return new_organization_id;
end;
$$;

revoke all on function public.create_organization_with_owner(text) from public;
grant execute on function public.create_organization_with_owner(text) to authenticated;
