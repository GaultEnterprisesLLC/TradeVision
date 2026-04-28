import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Auth context — wraps Supabase Auth and exposes session/user/sign-in/sign-out.
 *
 * Use:
 *   const { user, session, signInWithEmail, signOut } = useAuth();
 *
 * Magic-link flow:
 *   1. user types their email → signInWithEmail()
 *   2. Supabase sends a one-click sign-in link
 *   3. clicking the link returns to /auth/callback
 *   4. Supabase auto-detects the hash params and creates a session
 *   5. onAuthStateChange fires → state updates → app re-renders authed
 *
 * The "loading" flag prevents UI flicker on first paint while we wait
 * for Supabase to tell us whether a session already exists from a
 * previous visit.
 */

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Sends a magic link. resolves when the email is dispatched. */
  signInWithEmail: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hydrate from any existing session in storage.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Subscribe to all subsequent changes (sign-in, sign-out, refresh).
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signInWithEmail(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Send the user back to the callback route after they click the link.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { error: error ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const value: AuthContextValue = {
    user: session?.user ?? null,
    session,
    loading,
    signInWithEmail,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
