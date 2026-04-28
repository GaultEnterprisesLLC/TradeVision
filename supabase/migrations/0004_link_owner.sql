-- =====================================================================
-- TradeVision — Link first owner to the Gault tenant
-- =====================================================================
-- Migration: 0004_link_owner
--
-- Run this AFTER Nick has signed in once via the magic-link flow.
-- The first sign-in creates a row in auth.users; this migration adds
-- the corresponding row in tenant_users so RLS policies let him read
-- and write Gault Enterprises data.
--
-- It's idempotent — safe to run multiple times. If Nick's email or the
-- tenant slug changes, edit the WHERE clause accordingly.
-- =====================================================================

insert into public.tenant_users (tenant_id, user_id, role)
select t.id, u.id, 'owner'
from public.tenants t
cross join auth.users u
where t.slug = 'gault-enterprises'
  and u.email = 'nick@gaultenterprisesllc.com'
on conflict (tenant_id, user_id) do nothing;

-- Sanity check — should return one row after Nick signs in.
select
  t.name as tenant,
  u.email as user_email,
  tu.role
from public.tenant_users tu
join public.tenants t on t.id = tu.tenant_id
join auth.users u on u.id = tu.user_id
where t.slug = 'gault-enterprises';
