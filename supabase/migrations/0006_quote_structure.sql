-- =====================================================================
-- TradeVision — Quote structure: Options, Add-ons, Discounts, Notes
-- =====================================================================
-- Migration: 0006_quote_structure
-- Description:
--   Brings the quotes data model in line with FieldPulse's actual
--   structure:
--     - Options (primary-scope alternatives, e.g. Ecoer vs Rheem)
--       reuse the existing variant column on quote_line_items, with
--       per-quote labels stored in option_labels.
--     - Add-on Packages (independently-selectable bundles, e.g. UV
--       Light Install, Humidifier) get their own table; lines belonging
--       to an addon link via quote_line_items.addon_id.
--     - Quote-level discounts (Mass Save rebate match, condenser match,
--       general discount) get their own table.
--     - Top-of-quote work-order description and notes (financing /
--       Mass Save terms) become first-class columns on quotes.
--     - items and quote_line_items gain a `details` column for the
--       multi-line spec body (model #, AHRI #, capacity, etc.) shown
--       under the line label in customer-facing PDFs.
--
--   Apply via Supabase Dashboard → SQL Editor → paste this file → Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ITEMS — long-form details body from FP's Description column
-- ---------------------------------------------------------------------
alter table public.items
  add column if not exists details text;

comment on column public.items.details is
  'Long-form item description from FP (model #, AHRI #, specs). Customer-facing.';

-- ---------------------------------------------------------------------
-- QUOTES — work-order description, notes, per-quote option labels
-- ---------------------------------------------------------------------
alter table public.quotes
  add column if not exists work_order_description text,
  add column if not exists notes text,
  add column if not exists option_labels jsonb default '{}'::jsonb not null;

alter table public.quotes
  drop constraint if exists option_labels_is_object;
alter table public.quotes
  add constraint option_labels_is_object
    check (jsonb_typeof(option_labels) = 'object');

comment on column public.quotes.option_labels is
  'Per-quote labels for variants. e.g. {"good":"Ecoer 5 Ton HP","better":"Rheem 5 Ton A/C"}. Empty object for single-option quotes.';

-- ---------------------------------------------------------------------
-- QUOTE_ADDONS — independently-selectable bundles attached to a quote
-- ---------------------------------------------------------------------
create table if not exists public.quote_addons (
  id uuid primary key default uuid_generate_v4(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  name text not null,
  description text,
  position integer not null default 0,
  selected boolean not null default false,
  -- cached total — re-derived by the engine whenever lines change
  total_cents integer not null default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists quote_addons_quote_idx on public.quote_addons(quote_id);

-- ---------------------------------------------------------------------
-- QUOTE_DISCOUNTS — quote-level subtractions applied after subtotal
-- ---------------------------------------------------------------------
create table if not exists public.quote_discounts (
  id uuid primary key default uuid_generate_v4(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  label text not null,
  -- stored positive; applied as a subtraction at quote total time
  amount_cents integer not null check (amount_cents >= 0),
  position integer not null default 0,
  created_at timestamptz default now() not null
);
create index if not exists quote_discounts_quote_idx on public.quote_discounts(quote_id);

-- ---------------------------------------------------------------------
-- QUOTE_LINE_ITEMS — per-line details + optional addon link
-- ---------------------------------------------------------------------
-- A line with addon_id IS NULL belongs to an Option (or 'all' for shared
-- lines). A line with addon_id NOT NULL belongs to that Add-on Package.
alter table public.quote_line_items
  add column if not exists details text,
  add column if not exists addon_id uuid references public.quote_addons(id) on delete cascade;

create index if not exists quote_line_items_addon_idx
  on public.quote_line_items(addon_id);

-- ---------------------------------------------------------------------
-- ROW-LEVEL SECURITY for the new tables
-- (mirrors the existing tenant-scoped pattern from 0001)
-- ---------------------------------------------------------------------
alter table public.quote_addons    enable row level security;
alter table public.quote_discounts enable row level security;

create policy "quote_addons_all_own_tenant"
  on public.quote_addons for all
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

create policy "quote_discounts_all_own_tenant"
  on public.quote_discounts for all
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
-- updated_at trigger on quote_addons (matches house pattern from 0001)
-- ---------------------------------------------------------------------
drop trigger if exists quote_addons_updated_at on public.quote_addons;
create trigger quote_addons_updated_at before update on public.quote_addons
  for each row execute function public.set_updated_at();

-- =====================================================================
-- End of 0006_quote_structure
-- =====================================================================
