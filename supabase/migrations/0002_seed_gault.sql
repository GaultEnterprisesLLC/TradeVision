-- =====================================================================
-- TradeVision — Seed Gault Enterprises as Tenant #1
-- =====================================================================
-- Migration: 0002_seed_gault
-- Description:
--   Seeds the first tenant (Gault Enterprises) and its company settings
--   with the real numbers from the brand spec / product spec.
--
--   This migration only seeds tenant + company + settings — the user
--   linkage (tenant_users) is established when Nick signs up via
--   Supabase Auth and a row is inserted into tenant_users by the app.
-- =====================================================================

insert into public.tenants (slug, name)
values ('gault-enterprises', 'Gault Enterprises, LLC')
on conflict (slug) do nothing;

insert into public.companies (
  tenant_id, name, legal_name,
  address_line1, city, state, postal_code,
  phone, email
)
select
  t.id,
  'Gault Enterprises',
  'Gault Enterprises, LLC',
  '11 Jan Sebastian Drive, STE 13',
  'Sandwich',
  'MA',
  '02563',
  '508-648-7321',
  'nick@gaultenterprisesllc.com'
from public.tenants t
where t.slug = 'gault-enterprises'
  and not exists (
    select 1 from public.companies c where c.tenant_id = t.id
  );

-- Default settings rely on table defaults (MA tax, $225/300 labor, etc.)
insert into public.company_settings (company_id)
select c.id
from public.companies c
join public.tenants t on t.id = c.tenant_id
where t.slug = 'gault-enterprises'
  and not exists (
    select 1 from public.company_settings s where s.company_id = c.id
  );
