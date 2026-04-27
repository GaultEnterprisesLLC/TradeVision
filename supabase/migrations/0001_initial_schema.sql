-- =====================================================================
-- TradeVision — Initial multi-tenant schema
-- =====================================================================
-- Migration: 0001_initial_schema
-- Author: TradeVision team
-- Description:
--   Foundation tables for the white-label SaaS data model. Every record
--   that contains tenant data carries a tenant_id, and Row-Level Security
--   policies enforce that users can only see their own tenant's data.
--
--   Tenants own companies (one tenant = one company in v1, but the data
--   model supports multi-company tenants — useful when a contractor
--   acquires another business and wants both under one TradeVision login).
--
--   Apply via Supabase Dashboard → SQL Editor → paste this file → Run.
--   OR via Supabase CLI: `supabase db push`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- TENANTS (top-level customer of TradeVision SaaS)
-- ---------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,           -- url slug, e.g. 'gault-enterprises'
  name text not null,
  brand_color text,                    -- optional custom accent (overrides green)
  logo_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ---------------------------------------------------------------------
-- TENANT_USERS (membership: which auth users belong to which tenant)
-- ---------------------------------------------------------------------
create table public.tenant_users (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz default now() not null,
  primary key (tenant_id, user_id)
);

create index tenant_users_user_id_idx on public.tenant_users(user_id);

-- ---------------------------------------------------------------------
-- COMPANIES (operating company under a tenant)
-- ---------------------------------------------------------------------
create table public.companies (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  legal_name text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,                          -- 2-letter US state, e.g. 'MA'
  postal_code text,
  phone text,
  email text,
  license_number text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index companies_tenant_id_idx on public.companies(tenant_id);

-- ---------------------------------------------------------------------
-- COMPANY_SETTINGS (one row per company, the pricing engine inputs)
-- ---------------------------------------------------------------------
create table public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,

  -- Pricing mode
  pricing_mode text not null default 'markup' check (pricing_mode in ('markup', 'margin')),
  default_markup numeric(6,4) not null default 0.5000,   -- 50%
  default_margin numeric(6,4) not null default 0.4000,   -- 40%

  -- State sales tax (applied to pre-tax supplier cost)
  state_tax_rate numeric(6,4) not null default 0.0625,   -- MA default

  -- Labor (in cents, integer)
  labor_one_tech_cents integer not null default 22500,   -- $225/hr
  labor_two_tech_cents integer not null default 30000,   -- $300/hr
  labor_one_tech_ppp_cents integer not null default 20000,
  labor_two_tech_ppp_cents integer not null default 27500,

  -- Overhead allocation
  overhead_per_hour_cents integer not null default 2500,

  -- Generator electrical default
  generator_electrical_default text not null default 'subbed' check (
    generator_electrical_default in ('subbed', 'in_house')
  ),
  default_sub_rate_cents integer not null default 150000,

  -- Supplier cost-basis flag (Webb sends pre-tax; future suppliers may differ)
  webb_cost_basis text not null default 'pre_tax' check (
    webb_cost_basis in ('pre_tax', 'post_tax')
  ),

  updated_at timestamptz default now() not null
);

-- ---------------------------------------------------------------------
-- ITEMS (master catalog — bridges Webb part numbers and FieldPulse item IDs)
-- ---------------------------------------------------------------------
create table public.items (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  webb_part_number text,
  fp_item_id text,
  description text not null,
  category text,                       -- 'hvac', 'water_heater', 'fittings', etc.
  uom text default 'each',
  unit_cost_cents integer not null,    -- Webb pre-tax cost per UOM
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  -- A given Webb part is unique within a tenant
  unique (tenant_id, webb_part_number)
);

create index items_tenant_id_idx on public.items(tenant_id);
create index items_webb_part_idx on public.items(tenant_id, webb_part_number);
create index items_fp_id_idx on public.items(tenant_id, fp_item_id);
create index items_category_idx on public.items(tenant_id, category);

-- ---------------------------------------------------------------------
-- QUOTES (a job estimate, owned by a company under a tenant)
-- ---------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  -- FieldPulse linkage
  fp_job_id text,                      -- if pulled from FieldPulse
  fp_quote_id text,                    -- once pushed back to FieldPulse
  customer_name text,
  customer_address text,

  -- Module
  module text not null check (module in (
    'hvac', 'generator', 'water_heater', 'boiler',
    'plumbing_service', 'plumbing_new_construction'
  )),

  -- Status
  status text not null default 'draft' check (status in (
    'draft', 'in_progress', 'ready', 'sent', 'accepted', 'declined'
  )),

  -- Walkthrough video (Supabase Storage path)
  video_path text,
  video_uploaded_at timestamptz,

  -- Snapshot of pricing inputs at quote creation (so historical quotes
  -- don't change if settings change later)
  pricing_snapshot jsonb,

  -- Totals (cents) — recalculated whenever line items change
  subtotal_cents integer default 0 not null,
  total_cents integer default 0 not null,

  -- Selected GBB option (one of three variants), nullable until customer picks
  selected_variant text check (selected_variant in ('good', 'better', 'best')),

  created_by uuid references auth.users(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index quotes_tenant_id_idx on public.quotes(tenant_id);
create index quotes_company_id_idx on public.quotes(company_id);
create index quotes_status_idx on public.quotes(tenant_id, status);
create index quotes_fp_job_idx on public.quotes(fp_job_id);

-- ---------------------------------------------------------------------
-- QUOTE_LINE_ITEMS (line items per GBB variant)
-- ---------------------------------------------------------------------
create table public.quote_line_items (
  id uuid primary key default uuid_generate_v4(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  variant text not null check (variant in ('good', 'better', 'best', 'all')),
  -- 'all' means the line is in every GBB option (e.g. labor, permits)

  item_id uuid references public.items(id) on delete set null,
  description text not null,
  quantity numeric(10,3) not null default 1,
  unit_cost_cents integer not null,    -- frozen at quote creation
  unit_price_cents integer not null,   -- after markup/margin
  line_type text not null default 'material' check (line_type in (
    'material', 'labor', 'overhead', 'permit', 'sub', 'addon'
  )),
  position integer not null default 0,
  created_at timestamptz default now() not null
);

create index quote_line_items_quote_idx on public.quote_line_items(quote_id);
create index quote_line_items_variant_idx on public.quote_line_items(quote_id, variant);

-- ---------------------------------------------------------------------
-- ROW-LEVEL SECURITY
-- A user can only see/modify rows whose tenant_id is in their membership.
-- ---------------------------------------------------------------------
alter table public.tenants            enable row level security;
alter table public.tenant_users       enable row level security;
alter table public.companies          enable row level security;
alter table public.company_settings   enable row level security;
alter table public.items              enable row level security;
alter table public.quotes             enable row level security;
alter table public.quote_line_items   enable row level security;

-- Helper: which tenants does the current auth user belong to?
create or replace function public.user_tenants()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.tenant_users
  where user_id = auth.uid();
$$;

-- TENANTS: see only your own tenant rows.
create policy "tenants_select_own"
  on public.tenants for select
  using (id in (select public.user_tenants()));

create policy "tenants_update_own"
  on public.tenants for update
  using (id in (select public.user_tenants()));

-- TENANT_USERS: see your own memberships.
create policy "tenant_users_select_own"
  on public.tenant_users for select
  using (user_id = auth.uid() or tenant_id in (select public.user_tenants()));

-- COMPANIES, SETTINGS, ITEMS, QUOTES, LINE ITEMS: tenant-scoped.
create policy "companies_all_own_tenant"
  on public.companies for all
  using (tenant_id in (select public.user_tenants()))
  with check (tenant_id in (select public.user_tenants()));

create policy "company_settings_all_own_tenant"
  on public.company_settings for all
  using (
    company_id in (
      select id from public.companies
      where tenant_id in (select public.user_tenants())
    )
  )
  with check (
    company_id in (
      select id from public.companies
      where tenant_id in (select public.user_tenants())
    )
  );

create policy "items_all_own_tenant"
  on public.items for all
  using (tenant_id in (select public.user_tenants()))
  with check (tenant_id in (select public.user_tenants()));

create policy "quotes_all_own_tenant"
  on public.quotes for all
  using (tenant_id in (select public.user_tenants()))
  with check (tenant_id in (select public.user_tenants()));

create policy "quote_line_items_all_own_tenant"
  on public.quote_line_items for all
  using (
    quote_id in (
      select id from public.quotes
      where tenant_id in (select public.user_tenants())
    )
  )
  with check (
    quote_id in (
      select id from public.quotes
      where tenant_id in (select public.user_tenants())
    )
  );

-- ---------------------------------------------------------------------
-- updated_at triggers — keep updated_at columns honest.
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger company_settings_updated_at before update on public.company_settings
  for each row execute function public.set_updated_at();
create trigger items_updated_at before update on public.items
  for each row execute function public.set_updated_at();
create trigger quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();

-- =====================================================================
-- End of 0001_initial_schema
-- =====================================================================
