import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

/**
 * Auth callback — the page Supabase redirects the magic link back to.
 *
 * Supabase's onAuthStateChange will fire automatically once the session
 * cookie/storage is set from the magic-link hash. We just give the
 * runtime a tick to settle, then route the user into the app.
 *
 * If anything goes wrong (expired link, unsupported provider, etc.),
 * we surface the message and offer a retry.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Supabase auto-handles the URL hash on load (detectSessionInUrl).
      // We just check whether a session ended up created.
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error) {
        setError(error.message);
        return;
      }
      if (data.session) {
        navigate('/quotes', { replace: true });
        return;
      }

      // No session and no error — link probably expired.
      setError('We could not sign you in. The link may have expired.');
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 bg-[var(--color-carbon)]">
      <Logo variant="stacked" size="md" />
      {error ? (
        <div className="text-center max-w-sm">
          <p className="text-sm text-[var(--color-danger)] mb-3">{error}</p>
          <a
            href="/sign-in"
            className="text-sm text-[var(--color-green)] underline"
          >
            Try signing in again
          </a>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted)]">Signing you in…</p>
      )}
    </div>
  );
}
