-- =====================================================================
-- 0008_quotes_module_freetext — drop the module enum, allow free text
-- =====================================================================
-- The narration → AI flow generates job names that don't fit a fixed
-- enum ("Heat pump installation", "Bathroom remodel", etc.). Keeping
-- the column for grouping/filtering, just dropping the constraint.
--
-- Existing data in public.quotes.module (e.g. 'hvac', 'generator') is
-- still valid free-text after this migration runs.
-- =====================================================================

alter table public.quotes
  drop constraint if exists quotes_module_check;

comment on column public.quotes.module is
  'Free-text job type (e.g. "Heat pump installation", "Boiler replacement"). AI suggests from narration; user can override. Was previously CHECK-constrained to a fixed enum — removed in 0008.';
