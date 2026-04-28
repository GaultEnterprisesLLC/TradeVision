import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Logo } from './Logo';

/**
 * RequireAuth — guard component.
 *
 * Renders children when the user is signed in. While we're still
 * resolving the initial session, shows a brand-correct loading screen
 * (avoids the "flash of sign-in page" before Supabase finishes hydrating).
 * If unauthenticated, redirects to /sign-in and remembers where the user
 * was trying to go.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-carbon)] gap-4">
        <Logo variant="stacked" size="md" />
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
