import { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Input,
  MoneyInput,
  Select,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { money, percent } from '@/lib/format';
import {
  computeQuoteResult,
  effectivePricing,
  useAddLine,
  useDeleteLine,
  useDeleteQuote,
  useMarkReady,
  useQuote,
  useQuoteLines,
  useRecalcQuoteTotals,
  useReopenQuote,
  useUpdateLine,
  useUpdateQuote,
} from '@/lib/queries/quotes';
import { useCompany, useCompanySettings } from '@/lib/queries/company';
import type { PricingResult, PricingSettings } from '@/lib/pricing/types';
import type {
  LineType,
  Quote,
  QuoteLineItem,
  SelectedVariant,
  Variant,
} from '@/types/database';

/**
 * Quote editor — the spine for Stage 3A.
 *
 * Generic line-item editor that the engine prices live. HVAC- and other
 * module-specific guided UX layers on top of this in 3B.
 *
 * Behavior contract:
 *  - Customer info saves via the customer-card "Save" button.
 *  - Each line card saves itself (existing line) or adds itself (new
 *    line) via its own button. After every line mutation, totals on the
 *    parent quote row are recalculated.
 *  - First successful line edit on a `draft` quote auto-flips status to
 *    `in_progress`.
 *  - "Mark Ready" runs the coherent re-pricing pass + snapshot + status
 *    flip in useMarkReady. Once ready, the editor renders read-only
 *    until the user clicks "Reopen".
 */
export default function QuoteEditor() {
  const { id: quoteId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: company } = useCompany();
  const { data: liveSettings } = useCompanySettings(company?.id);
  const { data: quote, isLoading: quoteLoading, error: quoteError } = useQuote(quoteId);
  const { data: lines = [] } = useQuoteLines(quoteId);

  const updateQuote = useUpdateQuote();
  const recalc = useRecalcQuoteTotals();
  const markReady = useMarkReady();
  const reopen = useReopenQuote();
  const deleteQuote = useDeleteQuote();

  // ---------- Effective pricing ----------
  const pricing = useMemo(
    () => (quote ? effectivePricing(quote, liveSettings) : null),
    [quote, liveSettings],
  );
  const result = useMemo(
    () => (pricing ? computeQuoteResult(lines, pricing) : null),
    [lines, pricing],
  );

  // ---------- Render guards ----------
  if (quoteLoading) {
    return (
      <div className="px-4 py-12 text-center text-sm text-[var(--color-muted)]">
        Loading quote…
      </div>
    );
  }
  if (quoteError || !quote) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-[var(--color-danger)] mb-2">
          Couldn't load quote.
        </p>
        <Link to="/quotes" className="text-sm text-[var(--color-green)] underline">
          Back to quotes
        </Link>
      </div>
    );
  }

  const isFrozen = quote.status !== 'draft' && quote.status !== 'in_progress';

  return (
    <div className="px-4 py-6 flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link
            to="/quotes"
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            ← Quotes
          </Link>
          <h1 className="mt-1 truncate">
            {quote.customer_name || 'Untitled quote'}
          </h1>
          <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider mt-1">
            {moduleLabel(quote.module)}
          </p>
        </div>
        <StatusChip status={quote.status} fromFP={!!quote.fp_quote_id} />
      </header>

      <CustomerCard quote={quote} disabled={isFrozen} onSave={updateQuote.mutateAsync} />

      <LinesCard
        quote={quote}
        lines={lines}
        pricing={pricing}
        disabled={isFrozen}
        onAfterMutation={() => {
          if (!pricing || !quote) return;
          // Auto-flip draft → in_progress on first edit.
          if (quote.status === 'draft') {
            updateQuote.mutate({
              quoteId: quote.id,
              patch: { status: 'in_progress' },
            });
          }
          // Sync the parent quote's totals with the latest line set.
          recalc.mutate({
            quoteId: quote.id,
            pricing,
            selected_variant: quote.selected_variant,
          });
        }}
      />

      {result && pricing && (
        <TotalsCard
          quote={quote}
          result={result}
          disabled={isFrozen}
          onSelectVariant={(v) => {
            if (!quote) return;
            updateQuote.mutate({
              quoteId: quote.id,
              patch: { selected_variant: v },
            });
            // Also rewrite headline totals to reflect the new selection.
            recalc.mutate({
              quoteId: quote.id,
              pricing,
              selected_variant: v,
            });
          }}
        />
      )}

      {/* Lifecycle actions */}
      <div className="flex flex-col gap-2">
        {!isFrozen && lines.length > 0 && liveSettings && (
          <Button
            fullWidth
            size="lg"
            onClick={() => markReady.mutate({ quote, liveSettings })}
            disabled={markReady.isPending}
          >
            {markReady.isPending ? 'Freezing…' : 'Mark Ready'}
          </Button>
        )}

        {quote.status === 'ready' && (
          <Button
            fullWidth
            variant="secondary"
            size="md"
            onClick={() => reopen.mutate(quote.id)}
            disabled={reopen.isPending}
          >
            {reopen.isPending ? 'Reopening…' : 'Reopen quote'}
          </Button>
        )}

        <Button
          fullWidth
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!confirm('Delete this quote? This cannot be undone.')) return;
            deleteQuote.mutate(quote.id, {
              onSuccess: () => navigate('/quotes'),
            });
          }}
          disabled={deleteQuote.isPending}
        >
          Delete quote
        </Button>
      </div>
    </div>
  );
}

// =====================================================================
// CUSTOMER CARD
// =====================================================================

function CustomerCard({
  quote,
  disabled,
  onSave,
}: {
  quote: Quote;
  disabled: boolean;
  onSave: (args: {
    quoteId: string;
    patch: { customer_name?: string | null; customer_address?: string | null };
  }) => Promise<Quote>;
}) {
  const [name, setName] = useState(quote.customer_name ?? '');
  const [addr, setAddr] = useState(quote.customer_address ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Note: we deliberately don't sync from `quote.*` props on change. After
  // a save, server values match local values; if the user reloads or
  // another tab writes, a refresh re-mounts this card with fresh state.

  const dirty =
    (quote.customer_name ?? '') !== name || (quote.customer_address ?? '') !== addr;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        quoteId: quote.id,
        patch: {
          customer_name: name || null,
          customer_address: addr || null,
        },
      });
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-3">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mrs. Smith"
          disabled={disabled}
        />
        <Input
          label="Address"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="12 Main St, Anytown MA"
          disabled={disabled}
        />
        {!disabled && (
          <div className="flex items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSave}
              disabled={!dirty || saving}
            >
              {saving ? 'Saving…' : 'Save customer'}
            </Button>
            {savedAt && !dirty && (
              <span className="text-xs text-[var(--color-green)]">Saved.</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// =====================================================================
// LINES CARD (list + add)
// =====================================================================

function LinesCard({
  quote,
  lines,
  pricing,
  disabled,
  onAfterMutation,
}: {
  quote: Quote;
  lines: QuoteLineItem[];
  pricing: PricingSettings | null;
  disabled: boolean;
  onAfterMutation: () => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Line items</CardTitle>
          <span className="text-xs text-[var(--color-muted)] uppercase tracking-wider">
            {lines.length} line{lines.length === 1 ? '' : 's'}
          </span>
        </div>
      </CardHeader>

      <div className="flex flex-col gap-3">
        {lines.length === 0 && !adding && (
          <p className="text-sm text-[var(--color-muted)]">
            No lines yet. {disabled ? '' : 'Add one to start pricing.'}
          </p>
        )}

        {pricing &&
          lines.map((line) => (
            <LineEditor
              key={line.id}
              line={line}
              quoteId={quote.id}
              pricing={pricing}
              disabled={disabled}
              onAfterMutation={onAfterMutation}
            />
          ))}

        {adding && pricing && (
          <LineEditor
            key="new"
            line={null}
            quoteId={quote.id}
            pricing={pricing}
            disabled={false}
            onAfterMutation={() => {
              setAdding(false);
              onAfterMutation();
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {!disabled && !adding && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAdding(true)}
            disabled={!pricing}
          >
            + Add line
          </Button>
        )}
      </div>
    </Card>
  );
}

// =====================================================================
// LINE EDITOR — single row, inline
// =====================================================================

function LineEditor({
  line,
  quoteId,
  pricing,
  disabled,
  onAfterMutation,
  onCancel,
}: {
  line: QuoteLineItem | null;
  quoteId: string;
  pricing: PricingSettings;
  disabled: boolean;
  onAfterMutation: () => void;
  onCancel?: () => void;
}) {
  const isNew = line === null;

  const [lineType, setLineType] = useState<LineType>(line?.line_type ?? 'material');
  const [description, setDescription] = useState(line?.description ?? '');
  const [quantity, setQuantity] = useState<string>(
    line ? String(Number(line.quantity)) : '1',
  );
  const [unitCost, setUnitCost] = useState<number>(line?.unit_cost_cents ?? 0);
  const [variant, setVariant] = useState<Variant>(line?.variant ?? 'all');

  // Each existing line gets `key={line.id}` from the parent, so a server
  // line change for a *different* row mounts a fresh editor. After a save
  // the values we sent equal what came back, so local state stays in sync
  // without an effect.

  const addLine = useAddLine();
  const updateLine = useUpdateLine();
  const deleteLine = useDeleteLine();

  const dirty = isNew
    ? description.length > 0 || unitCost > 0
    : line
      ? lineType !== line.line_type ||
        description !== line.description ||
        Number(quantity) !== Number(line.quantity) ||
        unitCost !== line.unit_cost_cents ||
        variant !== line.variant
      : false;

  const valid = description.trim().length > 0 && Number(quantity) > 0;

  async function handleSave() {
    const qty = Number(quantity);
    if (!valid) return;
    if (isNew) {
      await addLine.mutateAsync({
        quoteId,
        line: {
          line_type: lineType,
          description: description.trim(),
          quantity: qty,
          unit_cost_cents: unitCost,
          variant,
          item_id: null,
          position: 0,
        },
        pricing,
      });
    } else if (line) {
      await updateLine.mutateAsync({
        lineId: line.id,
        quoteId,
        patch: {
          line_type: lineType,
          description: description.trim(),
          quantity: qty,
          unit_cost_cents: unitCost,
          variant,
        },
        pricing,
      });
    }
    onAfterMutation();
  }

  async function handleDelete() {
    if (!line) return;
    if (!confirm('Delete this line?')) return;
    await deleteLine.mutateAsync({ lineId: line.id, quoteId });
    onAfterMutation();
  }

  const saving = addLine.isPending || updateLine.isPending;

  return (
    <div
      className={cn(
        'rounded-[var(--radius-md)] border border-[var(--color-border)] p-3',
        'bg-[var(--color-carbon)] flex flex-col gap-3',
        isNew && 'border-[var(--color-green)]',
      )}
    >
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Type"
          value={lineType}
          onChange={(e) => setLineType(e.target.value as LineType)}
          disabled={disabled}
        >
          <option value="material">Material</option>
          <option value="labor">Labor</option>
          <option value="overhead">Overhead</option>
          <option value="permit">Permit</option>
          <option value="sub">Sub</option>
          <option value="addon">Add-on</option>
        </Select>
        <Input
          label="Qty"
          type="number"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          disabled={disabled}
          dataNumeric
        />
      </div>

      <Input
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. 3-ton AC condenser"
        disabled={disabled}
      />

      <div className="grid grid-cols-2 gap-3">
        <MoneyInput
          label="Unit cost"
          value={unitCost}
          onChange={setUnitCost}
        />
        <VariantPicker value={variant} onChange={setVariant} disabled={disabled} />
      </div>

      {/* Live single-line preview, only when fields are filled in. */}
      {valid && unitCost > 0 && (
        <LinePreview
          lineType={lineType}
          quantity={Number(quantity)}
          unitCost={unitCost}
          variant={variant}
          pricing={pricing}
        />
      )}

      {!disabled && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={!valid || (!isNew && !dirty) || saving}
            >
              {saving ? 'Saving…' : isNew ? 'Add' : 'Save'}
            </Button>
            {isNew && onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
          {!isNew && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteLine.isPending}
            >
              {deleteLine.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// LINE PREVIEW — shows what this single line resolves to
// =====================================================================

function LinePreview({
  lineType,
  quantity,
  unitCost,
  variant,
  pricing,
}: {
  lineType: LineType;
  quantity: number;
  unitCost: number;
  variant: Variant;
  pricing: PricingSettings;
}) {
  // Re-use the engine's preview path on a synthetic single line.
  const result = useMemo(
    () =>
      computeQuoteResult(
        [
          {
            id: 'preview',
            quote_id: 'preview',
            variant,
            item_id: null,
            description: 'preview',
            quantity,
            unit_cost_cents: unitCost,
            unit_price_cents: 0,
            line_type: lineType,
            position: 0,
            created_at: '',
          } as QuoteLineItem,
        ],
        pricing,
      ),
    [lineType, quantity, unitCost, variant, pricing],
  );
  const total =
    variant === 'all'
      ? result.variants.better.price_total_cents
      : result.variants[variant].price_total_cents;
  const cost =
    variant === 'all'
      ? result.variants.better.cost_total_cents
      : result.variants[variant].cost_total_cents;

  return (
    <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
      <span>
        Cost <span className="tabular-nums [font-family:var(--font-mono)]">{money(cost)}</span>
      </span>
      <span>
        Price{' '}
        <span className="tabular-nums [font-family:var(--font-mono)] text-[var(--color-text)]">
          {money(total)}
        </span>
      </span>
    </div>
  );
}

// =====================================================================
// VARIANT PICKER (4-option segmented for line variant)
// =====================================================================

function VariantPicker({
  value,
  onChange,
  disabled,
}: {
  value: Variant;
  onChange: (v: Variant) => void;
  disabled?: boolean;
}) {
  const options: { v: Variant; label: string }[] = [
    { v: 'all', label: 'All' },
    { v: 'good', label: 'Good' },
    { v: 'better', label: 'Better' },
    { v: 'best', label: 'Best' },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="text-xs uppercase tracking-wider text-[var(--color-muted)]"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
      >
        Variant
      </span>
      <div
        className={cn(
          'inline-flex p-1 bg-[var(--color-carbon)] border border-[var(--color-border)] rounded-[var(--radius-md)] gap-1',
          disabled && 'opacity-50 pointer-events-none',
        )}
      >
        {options.map((opt) => {
          const active = opt.v === value;
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => onChange(opt.v)}
              className={cn(
                'h-9 px-2 rounded-[var(--radius-sm)] text-xs font-medium transition-all duration-150',
                active
                  ? 'bg-[var(--color-green)] text-[var(--color-carbon)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-text)]',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// TOTALS CARD — GBB summary with selectable variant
// =====================================================================

function TotalsCard({
  quote,
  result,
  disabled,
  onSelectVariant,
}: {
  quote: Quote;
  result: PricingResult;
  disabled: boolean;
  onSelectVariant: (v: SelectedVariant) => void;
}) {
  const variants: { key: SelectedVariant; label: string }[] = [
    { key: 'good', label: 'Good' },
    { key: 'better', label: 'Better' },
    { key: 'best', label: 'Best' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Totals</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-2">
        {variants.map((v) => {
          const t = result.variants[v.key];
          const selected = quote.selected_variant === v.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => !disabled && onSelectVariant(v.key)}
              disabled={disabled}
              className={cn(
                'flex items-center justify-between',
                'rounded-[var(--radius-md)] border p-3 text-left transition-all duration-150',
                selected
                  ? 'border-[var(--color-green)] shadow-[var(--shadow-glow)]'
                  : 'border-[var(--color-border)]',
                disabled ? 'cursor-default' : 'cursor-pointer hover:border-[var(--color-green)]',
              )}
            >
              <div>
                <div
                  className="text-sm uppercase tracking-wider"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
                >
                  {v.label}
                </div>
                <div className="text-xs text-[var(--color-muted)] mt-0.5">
                  Margin {percent(t.margin_fraction)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-base tabular-nums [font-family:var(--font-mono)]">
                  {money(t.price_total_cents)}
                </div>
                <div className="text-xs text-[var(--color-muted)] tabular-nums [font-family:var(--font-mono)]">
                  cost {money(t.cost_total_cents)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {!disabled && (
        <p className="text-xs text-[var(--color-muted)] mt-3">
          Tap a tier to mark it as the customer's selection.
        </p>
      )}
    </Card>
  );
}

// =====================================================================
// STATUS CHIP
// =====================================================================

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
    <div className="flex flex-col items-end gap-1">
      <span
        className={cn(
          'px-2 py-1 rounded-[var(--radius-sm)] text-[10px] uppercase tracking-wider font-semibold',
          palette[status],
        )}
      >
        {status.replace('_', ' ')}
      </span>
      {fromFP && (
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          via FP
        </span>
      )}
    </div>
  );
}

// =====================================================================
// HELPERS
// =====================================================================

function moduleLabel(m: Quote['module']): string {
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
  }
}
