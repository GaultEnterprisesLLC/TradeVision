import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  Company,
  CompanySettings,
  CompanySettingsUpdate,
} from '@/types/database';

/**
 * Data hooks for the current user's company + settings.
 *
 * These wrap Supabase queries with TanStack Query, which gives us:
 *  - Automatic caching across screens
 *  - Loading + error state without boilerplate
 *  - Optimistic updates and easy invalidation after mutations
 *
 * RLS does the heavy lifting on the server: a query without a `where`
 * clause still only returns the current user's tenant rows, because
 * RLS filters them at the database level.
 *
 * Type approach: the Supabase client is untyped (see supabase.ts for
 * rationale), so each query casts its result explicitly. The schema
 * types in @/types/database are still the source of truth.
 */

const COMPANY_KEY = ['company'] as const;
const SETTINGS_KEY = ['company-settings'] as const;

// ---------------------------------------------------------------------
// useCompany — first company belonging to the current user's tenant
// ---------------------------------------------------------------------

async function fetchCompany(): Promise<Company | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Company | null) ?? null;
}

export function useCompany() {
  return useQuery({
    queryKey: COMPANY_KEY,
    queryFn: fetchCompany,
  });
}

// ---------------------------------------------------------------------
// useCompanySettings — settings row for the current user's company
// ---------------------------------------------------------------------

async function fetchSettings(companyId: string): Promise<CompanySettings | null> {
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  return (data as CompanySettings | null) ?? null;
}

export function useCompanySettings(companyId: string | undefined) {
  return useQuery({
    queryKey: [...SETTINGS_KEY, companyId],
    queryFn: () => fetchSettings(companyId!),
    enabled: !!companyId,
  });
}

// ---------------------------------------------------------------------
// useUpdateSettings — patch settings, invalidate cache
// ---------------------------------------------------------------------

interface UpdateArgs {
  companyId: string;
  patch: CompanySettingsUpdate;
}

async function updateSettings({ companyId, patch }: UpdateArgs): Promise<CompanySettings> {
  const { data, error } = await supabase
    .from('company_settings')
    .update(patch as Record<string, unknown>)
    .eq('company_id', companyId)
    .select('*')
    .single();
  if (error) throw error;
  return data as CompanySettings;
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: (data) => {
      // Refresh the local cache with the row Supabase just returned
      // so the UI stays in sync without a re-fetch round-trip.
      qc.setQueryData([...SETTINGS_KEY, data.company_id], data);
    },
  });
}
