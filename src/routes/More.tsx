import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useCompany } from '@/lib/queries/company';
import { Button, Card, CardHeader, CardTitle } from '@/components/ui';

/**
 * More — profile + sign-out + future: integrations, billing, help, etc.
 */
export default function More() {
  const { user, signOut } = useAuth();
  const { data: company } = useCompany();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/sign-in', { replace: true });
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-5">
      <header>
        <h1>More</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <dl className="flex flex-col gap-2 text-sm">
          <Row label="Signed in as" value={user?.email ?? '—'} />
          <Row label="Company" value={company?.name ?? '—'} />
          <Row
            label="Address"
            value={
              company
                ? `${company.address_line1 ?? ''}${
                    company.city ? ', ' + company.city : ''
                  }${company.state ? ', ' + company.state : ''}`
                : '—'
            }
          />
        </dl>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
        </CardHeader>
        <ul className="text-sm text-[var(--color-muted)] flex flex-col gap-1">
          <li>· FieldPulse connection</li>
          <li>· FW Webb connection</li>
          <li>· Team members & roles</li>
          <li>· Billing</li>
        </ul>
      </Card>

      <Button variant="secondary" fullWidth onClick={handleSignOut}>
        Sign out
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-[var(--color-border)] last:border-0">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="text-[var(--color-text)] text-right">{value}</dd>
    </div>
  );
}
