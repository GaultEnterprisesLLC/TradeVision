import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Supabase client — singleton.
 *
 * Uses the new "Publishable" key (sb_publishable_*), the safe-in-browser
 * key from Supabase's modern API key system. Row-Level Security policies
 * on the database protect tenant data; the publishable key cannot bypass
 * them.
 *
 * The Secret API key (sb_secret_*) is for server-side Edge Functions only
 * and is never imported here.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env.local and fill in your project values.',
  );
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
