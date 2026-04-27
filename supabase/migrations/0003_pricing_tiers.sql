-- =====================================================================
-- TradeVision — Tiered pricing
-- =====================================================================
-- Migration: 0003_pricing_tiers
-- Description:
--   Adds optional tier brackets to company_settings for both markup and
--   margin modes. When a tier array is non-empty, the engine uses it.
--   Otherwise it falls back to the single default_markup / default_margin.
--
--   Tier shape (JSONB):
--     [
--       { "max_cost_cents": 20000,  "rate": 2.00 },   -- $0–200    → 200% markup
--       { "max_cost_cents": 50000,  "rate": 1.00 },   -- $200–500  → 100% markup
--       { "max_cost_cents": null,   "rate": 0.67 }    -- $500+     → 67% markup
--     ]
--
--   - `max_cost_cents = null` means "no upper bound" (must be the LAST tier)
--   - `rate` is a fraction: 1.0 = 100%, 0.67 = 67%, 2.0 = 200%
--   - Tiers MUST be sorted ascending by max_cost_cents (null last)
--   - Engine validates these constraints; UI prevents bad input
--
--   Apply via Supabase Dashboard → SQL Editor → paste → Run.
-- =====================================================================

alter table public.company_settings
  add column if not exists markup_tiers jsonb default '[]'::jsonb not null,
  add column if not exists margin_tiers jsonb default '[]'::jsonb not null;

-- Sanity: tiers must be a JSON array (a single object would break the engine).
alter table public.company_settings
  add constraint markup_tiers_is_array check (jsonb_typeof(markup_tiers) = 'array'),
  add constraint margin_tiers_is_array check (jsonb_typeof(margin_tiers) = 'array');

comment on column public.company_settings.markup_tiers is
  'Array of {max_cost_cents, rate} brackets for markup mode. Empty = use default_markup.';
comment on column public.company_settings.margin_tiers is
  'Array of {max_cost_cents, rate} brackets for margin mode. Empty = use default_margin.';
