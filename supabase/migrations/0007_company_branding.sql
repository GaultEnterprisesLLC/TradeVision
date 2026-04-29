-- =====================================================================
-- TradeVision — Per-company branding (logo + brand colors)
-- =====================================================================
-- Migration: 0007_company_branding
-- Description:
--   White-label support for the customer-facing PDF. Each company
--   (tenant) brings its own header logo + two brand colors:
--
--     - logo_url:             public URL of the header logo
--                             (typically Supabase Storage in tenant-assets)
--     - brand_color_primary:  heading text, totals border, big total
--                             (universal pro navy when null)
--     - brand_color_accent:   selected-option highlight, section
--                             underlines, "Selected" chip
--                             (universal pro blue when null)
--
--   The renderer in components/pdf/QuotePDF.tsx reads from these
--   columns; nulls fall back to neutral defaults so an unconfigured
--   tenant still produces a clean, professional PDF.
--
--   Storage bucket "tenant-assets" + RLS are configured separately
--   (run the storage SQL block alongside this migration).
--
--   Apply via Supabase Dashboard → SQL Editor → paste → Run.
-- =====================================================================

alter table public.companies
  add column if not exists logo_url text,
  add column if not exists brand_color_primary text,
  add column if not exists brand_color_accent  text;

comment on column public.companies.logo_url is
  'Public URL of the company''s header logo. Typically a Supabase Storage URL inside tenant-assets bucket; can also be an external CDN.';
comment on column public.companies.brand_color_primary is
  'Hex color (e.g. #3A557C) used for headings, totals border, big total. Defaults to a universal pro navy when null.';
comment on column public.companies.brand_color_accent is
  'Hex color (e.g. #FF6720) used for "Selected" chip, section underlines, selected-option highlight. Defaults to pro blue when null.';

-- =====================================================================
-- End of 0007_company_branding
-- =====================================================================
