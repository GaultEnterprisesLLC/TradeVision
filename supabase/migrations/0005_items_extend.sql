-- =====================================================================
-- TradeVision — Extend items table for catalog import
-- =====================================================================
-- Migration: 0005_items_extend
-- Description:
--   Adds a `line_type` column to public.items so the catalog knows how
--   each item should price when added to a quote. The values mirror
--   quote_line_items.line_type:
--     - material  → tier-marked-up (most products)
--     - labor     → pass-through (HVAC Labor, hourly rates, packages)
--     - overhead  → pass-through
--     - permit    → pass-through (permits and plans)
--     - sub       → tier-marked-up (subcontracted scope)
--     - addon     → tier-marked-up (UV light, humidifier, discounts)
--
--   Default is 'material' since that's the bulk of the catalog. The
--   importer will set 'labor', 'permit', and 'addon' explicitly based
--   on the FieldPulse "Item Type" + category prefix.
--
--   Apply via Supabase Dashboard → SQL Editor → paste → Run.
-- =====================================================================

alter table public.items
  add column if not exists line_type text not null default 'material'
    check (line_type in ('material', 'labor', 'overhead', 'permit', 'sub', 'addon'));

create index if not exists items_line_type_idx
  on public.items(tenant_id, line_type);

comment on column public.items.line_type is
  'How this item prices when added to a quote. material/sub/addon get tier markup; labor/overhead/permit pass through.';
