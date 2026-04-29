import { Link } from 'react-router-dom';
import { Card, CardTitle } from '@/components/ui';
import { cn } from '@/lib/cn';
import { moneyWhole } from '@/lib/format';
import { useCompany } from '@/lib/queries/company';
import { useQuotes } from '@/lib/queries/quotes';
import type { Quote } from '@/types/database';

/**
 * Quotes list — Stage 3A.
 *
 * Lists every quote belonging to the current company, sorted by most
 * recently updated. RLS in Supabase keeps this scoped to the user's
 * tenant; the explicit company_id filter scopes to the current company
 * (since a tenant may eventually own more than one).
 *
 * Each card links to /quotes/:id/edit.
 */
export default function Quotes() {
  const { data: company } = useCompany();
  const { data: quotes = [], isLoading, error } = useQuotes(company?.id);

  if (isLoading) {
    return (
      <div className="px-4 py-12 text-center text-sm text-[var(--color-muted)]">
        Loading quotes…
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-[var(--color-danger)]">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <h1>Quotes</h1>

      {quotes.length === 0 ? (
        <Card>
          <CardTitle>No quotes yet</CardTitle>
          <p className="text-sm text-[var(--color-muted)] mt-2">
            Tap the green <span className="text-[var(--color-green)]">+</span>{' '}
            below to start your first quote.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {quotes.map((q) => (
            <QuoteRow key={q.id} quote={q} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------

function QuoteRow({ quote }: { quote: Quote }) {
  const customer = quote.customer_name?.trim() || 'Untitled quote';
  const updated = relativeTime(quote.updated_at);
  const fromFP = !!quote.fp_quote_id;

  return (
    <Link to={`/quotes/${quote.id}/edit`} className="block">
      <Card interactive>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle>{customer}</CardTitle>
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider mt-1">
              {moduleLabel(quote.module)}
            </p>
            <p className="text-xs text-[var(--color-muted)] mt-2">
              Updated {updated}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusChip status={quote.status} fromFP={fromFP} />
            {quote.total_cents > 0 && (
              <div className="text-base tabular-nums [font-family:var(--font-mono)] text-[var(--color-text)]">
                {moneyWhole(quote.total_cents)}
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

function StatusChip({ status, fromFP }: { status: Quote['status']; fromFP: boolean }) {
  const palette: Record<Quote['status'], string> = {
    draft: 'bg-[var(--color-border)] text-[var(--color-muted)]',
    in_progress: 'bg-[var(--color-navy)] text-[var(--color-text)]',
    ready: 'bg-[var(--color-green)] text-[var(--color-carbon)]',
    sent: 'bg-[var(--color-navy)] text-[var(--color-text)]',
    accepted: 'bg-[var(--color-green)] text-[var(--color-carbon)]',
    declined: 'bg-[var(--color-danger)] text-white',
  };
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        className={cn(
          'px-2 py-0.5 rounded-[var(--radius-sm)] text-[10px] uppercase tracking-wider font-semibold',
          palette[status],
        )}
      >
        {status.replace('_', ' ')}
      </span>
      {fromFP && (
        <span className="text-[9px] uppercase tracking-wider text-[var(--color-muted)]">
          via FP
        </span>
      )}
    </div>
  );
}

function moduleLabel(m: Quote['module']): string {
  // Legacy fixed-enum cases get pretty labels; everything else (the new
  // free-text values from the narration flow) shows verbatim.
  switch (m) {
    case 'hvac':
      return 'HVAC Changeout';
    case 'generator':
      return 'Generator';
    case 'water_heater':
      return 'Water Heater';
    case 'boiler':
      return 'Boiler';
    case 'plumbing_service':
      return 'Plumbing Service';
    case 'plumbing_new_construction':
      return 'New Construction';
    default:
      return m || 'Quote';
  }
}

/** Compact "5m ago" / "3h ago" / "Apr 28" relative formatter. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 7 * 86400) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
