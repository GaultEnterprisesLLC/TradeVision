import { useMemo } from 'react';
import { Button, MoneyInput, PercentInput } from '@/components/ui';
import { validateTiers } from '@/lib/pricing';
import type { PricingTier } from '@/lib/pricing';
import { cn } from '@/lib/cn';

/**
 * PricingTierEditor — manage an ordered list of cost brackets.
 *
 * Each row sets a max cost (in cents) and a rate (fraction). The last
 * row is special: its cap is unlimited (max_cost_cents = null), which
 * is rendered as the "Anything higher" row in the UI.
 *
 * Real-time validation surfaces issues (out-of-order caps, negative
 * rates, etc.) below the table; the parent saves the tiers as-is.
 */
interface PricingTierEditorProps {
  /** Either 'markup' or 'margin' — used purely for label copy. */
  mode: 'markup' | 'margin';
  tiers: PricingTier[];
  onChange: (next: PricingTier[]) => void;
}

export function PricingTierEditor({ mode, tiers, onChange }: PricingTierEditorProps) {
  const rateLabel = mode === 'markup' ? 'Markup %' : 'Margin %';
  const issues = useMemo(() => validateTiers(tiers), [tiers]);

  function updateTier(index: number, patch: Partial<PricingTier>) {
    const next = tiers.map((t, i) => (i === index ? { ...t, ...patch } : t));
    onChange(next);
  }

  function removeTier(index: number) {
    const next = tiers.filter((_, i) => i !== index);
    // Make sure the remaining last tier is the open-ended one if any tier exists.
    if (next.length > 0) {
      next[next.length - 1] = { ...next[next.length - 1], max_cost_cents: null };
    }
    onChange(next);
  }

  function addTier() {
    // Insert a new finite-cap row before the open-ended last row, OR seed
    // an array with a single open-ended tier if empty.
    if (tiers.length === 0) {
      onChange([{ max_cost_cents: null, rate: mode === 'markup' ? 0.5 : 0.4 }]);
      return;
    }
    const newCap =
      tiers.length >= 2
        ? // Halfway between the second-to-last cap and current last finite-cap, or +50000
          (tiers[tiers.length - 2].max_cost_cents ?? 0) + 50000
        : 20000;
    const next: PricingTier[] = [
      ...tiers.slice(0, -1),
      { max_cost_cents: newCap, rate: tiers[tiers.length - 1].rate },
      tiers[tiers.length - 1], // keep the open-ended row at the end
    ];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {tiers.length === 0 ? (
        <div
          className={cn(
            'border border-dashed border-[var(--color-border)] rounded-[var(--radius-md)]',
            'p-4 text-sm text-[var(--color-muted)] text-center',
          )}
        >
          No tiers defined — using the single default rate above.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tiers.map((tier, i) => {
            const isLast = i === tiers.length - 1;
            return (
              <div
                key={i}
                className={cn(
                  'grid grid-cols-[1fr_1fr_auto] gap-2 items-end',
                  'p-3 bg-[var(--color-carbon)] border border-[var(--color-border)] rounded-[var(--radius-md)]',
                )}
              >
                {isLast ? (
                  <div className="flex flex-col gap-1.5 self-stretch">
                    <span
                      className="text-xs uppercase tracking-wider text-[var(--color-muted)]"
                      style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
                    >
                      Cost up to
                    </span>
                    <div
                      className={cn(
                        'flex items-center h-12 px-3 rounded-[var(--radius-md)]',
                        'bg-[var(--color-surface)] border border-[var(--color-border)]',
                        'text-sm text-[var(--color-muted)]',
                      )}
                    >
                      Anything higher
                    </div>
                  </div>
                ) : (
                  <MoneyInput
                    label="Cost up to"
                    value={tier.max_cost_cents ?? 0}
                    onChange={(cents) => updateTier(i, { max_cost_cents: cents })}
                  />
                )}

                <PercentInput
                  label={rateLabel}
                  value={tier.rate}
                  onChange={(rate) => updateTier(i, { rate })}
                />

                <Button
                  variant="ghost"
                  size="md"
                  aria-label="Remove tier"
                  onClick={() => removeTier(i)}
                  // Don't allow removing the last remaining tier — at least one
                  // open-ended row must always exist when tiers are in use.
                  disabled={tiers.length === 1}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Button variant="secondary" size="sm" onClick={addTier}>
        + Add tier
      </Button>

      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 mt-1">
          {issues.map((msg, i) => (
            <li
              key={i}
              className="text-xs text-[var(--color-danger)]"
            >
              {msg}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
