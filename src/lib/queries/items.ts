import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { indexItem, type SearchableItem } from '@/lib/items';
import type { Item } from '@/types/database';

/**
 * useItems / useSearchableItems
 *
 * The catalog is small enough (~1k items per tenant for now) to load all
 * at once, cache, and search in-memory. RLS scopes to the tenant on the
 * server. We use a long staleTime because the catalog rarely changes
 * mid-session — re-import is the explicit refresh path.
 */

const ITEMS_KEY = ['items'] as const;

async function fetchItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('description', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Item[];
}

export function useItems() {
  return useQuery({
    queryKey: ITEMS_KEY,
    queryFn: fetchItems,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Same data as useItems(), but returned as pre-indexed SearchableItem
 * rows so search/filter is O(n) without re-lowercasing on every keystroke.
 * Memoized — re-runs only when the underlying items array changes.
 */
export function useSearchableItems(): {
  data: SearchableItem[] | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useItems();
  const indexed = useMemo(
    () => (data ? data.map(indexItem) : undefined),
    [data],
  );
  return { data: indexed, isLoading, error: error as Error | null };
}
