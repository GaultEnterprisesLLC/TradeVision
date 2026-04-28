import { createClient } from '@supabase/supabase-js';

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
 *
 * Note on types: we deliberately don't pass a Database generic to
 * createClient() — instead each query function in src/lib/queries casts
 * its return type explicitly. This avoids version-coupling our schema
 * types to @supabase/supabase-js internals (which change between minor
 * versions). When we install the Supabase CLI and run
 * `supabase gen types typescript`, we'll switch to the generic.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env.local and fill in your project values.',
  );
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
