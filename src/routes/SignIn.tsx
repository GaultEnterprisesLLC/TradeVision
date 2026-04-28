import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Button, Card, CardTitle, Input } from '@/components/ui';
import { Logo } from '@/components/Logo';

/**
 * Sign-in page — passwordless magic link.
 *
 * Three states:
 *  - idle: form ready
 *  - sending: button disabled, spinner copy
 *  - sent: success message, "check your email"
 *  - error: red banner with the Supabase message
 */
type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function SignIn() {
  const { user, loading, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // If already signed in, bounce to the app.
  if (!loading && user) {
    return <Navigate to="/quotes" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    setErrorMsg('');
    const { error } = await signInWithEmail(email.trim());
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
    } else {
      setStatus('sent');
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-10 bg-[var(--color-carbon)]">
      <Logo variant="stacked" size="lg" />

      <Card className="w-full max-w-sm">
        {status === 'sent' ? (
          <div className="flex flex-col gap-3 text-center">
            <CardTitle>Check your email</CardTitle>
            <p className="text-sm text-[var(--color-muted)]">
              We sent a sign-in link to{' '}
              <span className="text-[var(--color-text)] font-medium">{email}</span>.
              Click the link on this device to sign in.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStatus('idle')}
            >
              Use a different email
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="text-center">
              <CardTitle>Sign in</CardTitle>
              <p className="text-xs text-[var(--color-muted)] mt-2">
                We'll email you a one-click sign-in link. No password needed.
              </p>
            </div>

            <Input
              label="Work email"
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nick@gaultenterprisesllc.com"
              required
            />

            <Button
              type="submit"
              fullWidth
              size="lg"
              disabled={status === 'sending' || !email.trim()}
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </Button>

            {status === 'error' && (
              <p className="text-sm text-[var(--color-danger)] text-center">
                {errorMsg}
              </p>
            )}
          </form>
        )}
      </Card>

      <p className="text-xs text-[var(--color-muted)]">
        Powered by TradeVision · tradevision.us
      </p>
    </div>
  );
}
