import { useState } from 'react';
import { MoneyInput } from '@/components/ui';
import { previewMaterialPrice } from '@/lib/pricing';
import { money, percent } from '@/lib/format';
import type { PricingSettings } from '@/lib/pricing';

/**
 * PricePreview — sanity-check the current pricing config.
 *
 * The contractor types in a hypothetical material cost; we run it
 * through the live engine and show:
 *   - cost basis (with state tax applied)
 *   - the markup/margin rate that bracket landed on
 *   - the resulting customer price
 *
 * This is the fastest way to verify a tier change does what you expect
 * before saving.
 */
interface PricePreviewProps {
  settings: PricingSettings;
}

export function PricePreview({ settings }: PricePreviewProps) {
  const [cost, setCost] = useState(40000); // $400 default — lands mid-table

  const result = previewMaterialPrice(cost, settings);

  return (
    <div className="flex flex-col gap-4">
      <MoneyInput
        label="Test material cost"
        value={cost}
        onChange={setCost}
        hint="Enter a Webb pre-tax cost to see how it prices out."
      />

      <div className="grid grid-cols-3 gap-3">
        <PreviewStat label="Cost + tax" value={money(result.unit_cost_with_tax_cents)} />
        <PreviewStat
          label={settings.pricing_mode === 'markup' ? 'Markup' : 'Margin'}
          value={percent(result.applied_rate)}
        />
        <PreviewStat label="Customer price" value={money(result.unit_price_cents)} highlight />
      </div>
    </div>
  );
}

function PreviewStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        'flex flex-col gap-1 p-3 rounded-[var(--radius-md)]',
        'border',
        highlight
          ? 'bg-[var(--color-green)]/10 border-[var(--color-green)]'
          : 'bg-[var(--color-carbon)] border-[var(--color-border)]',
      ].join(' ')}
    >
      <span
        className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
      >
        {label}
      </span>
      <span
        className={[
          'text-base tabular-nums',
          highlight ? 'text-[var(--color-green)]' : 'text-[var(--color-text)]',
        ].join(' ')}
        style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}
      >
        {value}
      </span>
    </div>
  );
}
