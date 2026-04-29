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
import { money, moneyWhole, percent } from '@/lib/format';
import {
  computeHeadlineGrandTotal,
  computeQuoteResult,
  effectivePricing,
  useAddLine,
  useBulkAddLines,
  useCreateAddon,
  useCreateDiscount,
  useDeleteAddon,
  useDeleteDiscount,
  useDeleteLine,
  useDeleteQuote,
  useMarkReady,
  useQuote,
  useQuoteAddons,
  useQuoteDiscounts,
  useQuoteLines,
  useRecalcQuoteTotals,
  useReopenQuote,
  useUpdateAddon,
  useUpdateLine,
  useUpdateQuote,
} from '@/lib/queries/quotes';
import { useCompany, useCompanySettings } from '@/lib/queries/company';
import { ItemPicker } from '@/components/ItemPicker';
import { cleanItemDescription } from '@/lib/items';
import type { PricingResult, PricingSettings } from '@/lib/pricing/types';
import type {
  Item,
  LineType,
  Quote,
  QuoteAddon,
  QuoteDiscount,
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
  const { data: addons = [] } = useQuoteAddons(quoteId);
  const { data: discounts = [] } = useQuoteDiscounts(quoteId);

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

  // Lines split by where they belong: option-scope (no addon_id) vs.
  // addon-scope (one addon_id each). Addon lines never appear in the
  // primary "Lines" section.
  const optionLines = useMemo(
    () => lines.filter((l) => l.addon_id == null),
    [lines],
  );
  const linesByAddon = useMemo(() => {
    const map = new Map<string, QuoteLineItem[]>();
    for (const l of lines) {
      if (l.addon_id == null) continue;
      const arr = map.get(l.addon_id) ?? [];
      arr.push(l);
      map.set(l.addon_id, arr);
    }
    return map;
  }, [lines]);

  // Single recalc trigger reused after every line / addon / discount change.
  const onAfterMutation = () => {
    if (!pricing || !quote) return;
    if (quote.status === 'draft') {
      updateQuote.mutate({
        quoteId: quote.id,
        patch: { status: 'in_progress' },
      });
    }
    recalc.mutate({
      quoteId: quote.id,
      pricing,
      selected_variant: quote.selected_variant,
    });
  };

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

      <WorkOrderCard
        quote={quote}
        disabled={isFrozen}
        onSave={updateQuote.mutateAsync}
      />

      <LinesCard
        quote={quote}
        lines={optionLines}
        pricing={pricing}
        disabled={isFrozen}
        onAfterMutation={onAfterMutation}
      />

      <AddonsSection
        quote={quote}
        addons={addons}
        linesByAddon={linesByAddon}
        pricing={pricing}
        disabled={isFrozen}
        onAfterMutation={onAfterMutation}
      />

      <DiscountsSection
        quote={quote}
        discounts={discounts}
        disabled={isFrozen}
        onAfterMutation={onAfterMutation}
      />

      {result && pricing && (
        <TotalsCard
          quote={quote}
          result={result}
          addons={addons}
          discounts={discounts}
          disabled={isFrozen}
          onSelectVariant={(v) => {
            if (!quote) return;
            updateQuote.mutate({
              quoteId: quote.id,
              patch: { selected_variant: v },
            });
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

        {/* PDF: available any time there are lines. Routes to the inline
            preview where the user can review, then tap "Send to customer". */}
        {lines.length > 0 && (
          <Button
            fullWidth
            size="md"
            variant="secondary"
            onClick={() => navigate(`/quotes/${quote.id}/preview`)}
          >
            Preview PDF
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState<Item | null>(null);
  const bulkAdd = useBulkAddLines();

  function closeAdd() {
    setAdding(false);
    setPendingItem(null);
  }

  async function handleQuickAdd(items: Item[]) {
    if (!pricing || items.length === 0) return;
    await bulkAdd.mutateAsync({
      quoteId: quote.id,
      pricing,
      lines: items.map((item, i) => ({
        line_type: item.line_type,
        description: cleanItemDescription(item.description),
        details: item.details,
        quantity: 1,
        unit_cost_cents: item.unit_cost_cents,
        variant: 'all',
        item_id: item.id,
        position: lines.length + i,
        addon_id: null,
      })),
    });
    onAfterMutation();
  }

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
            key={pendingItem ? `new-${pendingItem.id}` : 'new'}
            line={null}
            initialItem={pendingItem}
            quoteId={quote.id}
            pricing={pricing}
            disabled={false}
            onAfterMutation={() => {
              closeAdd();
              onAfterMutation();
            }}
            onCancel={closeAdd}
          />
        )}

        {!disabled && !adding && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPickerOpen(true)}
            disabled={!pricing}
          >
            + Add line
          </Button>
        )}
      </div>

      <ItemPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(result) => {
          setPickerOpen(false);
          if (result.kind === 'items') {
            // Quick Add — bulk insert, no per-item editor stop.
            void handleQuickAdd(result.items);
            return;
          }
          // Custom — open the blank LineEditor.
          setPendingItem(null);
          setAdding(true);
        }}
      />
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
  /** When set, this LineEditor is scoped to an Add-on Package — variant picker is hidden, addon_id is set on save. */
  addonId,
  /** When provided (only meaningful when line is null/new), seeds initial form state from a catalog item. */
  initialItem,
}: {
  line: QuoteLineItem | null;
  quoteId: string;
  pricing: PricingSettings;
  disabled: boolean;
  onAfterMutation: () => void;
  onCancel?: () => void;
  addonId?: string;
  initialItem?: Item | null;
}) {
  const isNew = line === null;
  const inAddon = addonId != null;

  // For new lines: prefer existing line state, else seed from a picked
  // catalog item, else empty defaults.
  const [lineType, setLineType] = useState<LineType>(
    line?.line_type ?? initialItem?.line_type ?? 'material',
  );
  const [description, setDescription] = useState(
    line?.description ??
      (initialItem ? cleanItemDescription(initialItem.description) : ''),
  );
  const [quantity, setQuantity] = useState<string>(
    line ? String(Number(line.quantity)) : '1',
  );
  const [unitCost, setUnitCost] = useState<number>(
    line?.unit_cost_cents ?? initialItem?.unit_cost_cents ?? 0,
  );
  const [variant, setVariant] = useState<Variant>(line?.variant ?? 'all');
  // Catalog linkage — preserved on save so the line traces back to the
  // imported item (used for future FieldPulse round-trip).
  const [itemId] = useState<string | null>(line?.item_id ?? initialItem?.id ?? null);
  const [details] = useState<string | null>(
    line?.details ?? initialItem?.details ?? null,
  );

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
          details,
          quantity: qty,
          unit_cost_cents: unitCost,
          variant: inAddon ? 'all' : variant,
          item_id: itemId,
          position: 0,
          addon_id: addonId ?? null,
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

      <div className={cn('grid gap-3', inAddon ? 'grid-cols-1' : 'grid-cols-2')}>
        <MoneyInput
          label="Unit cost"
          value={unitCost}
          onChange={setUnitCost}
        />
        {!inAddon && (
          <VariantPicker value={variant} onChange={setVariant} disabled={disabled} />
        )}
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
  addons,
  discounts,
  disabled,
  onSelectVariant,
}: {
  quote: Quote;
  result: PricingResult;
  addons: QuoteAddon[];
  discounts: QuoteDiscount[];
  disabled: boolean;
  onSelectVariant: (v: SelectedVariant) => void;
}) {
  const variants: { key: SelectedVariant; label: string }[] = [
    { key: 'good', label: 'Good' },
    { key: 'better', label: 'Better' },
    { key: 'best', label: 'Best' },
  ];

  const selectedVariant: SelectedVariant = quote.selected_variant ?? 'better';
  const grand = useMemo(
    () => computeHeadlineGrandTotal(result, quote.selected_variant, addons, discounts),
    [result, quote.selected_variant, addons, discounts],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Totals</CardTitle>
      </CardHeader>

      {/* Per-Option chooser. Selecting one becomes the basis of the grand total. */}
      <div className="flex flex-col gap-2 mb-4">
        {variants.map((v) => {
          const t = result.variants[v.key];
          const selected = selectedVariant === v.key;
          const empty = t.price_total_cents === 0;
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
                empty && 'opacity-60',
                disabled ? 'cursor-default' : 'cursor-pointer hover:border-[var(--color-green)]',
              )}
            >
              <div>
                <div
                  className="text-sm uppercase tracking-wider"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
                >
                  {quote.option_labels?.[v.key] || v.label}
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

      {/* Grand total breakdown — selected option + selected addons − discounts */}
      <div className="flex flex-col gap-1 pt-3 border-t border-[var(--color-border)]">
        <TotalRow
          label="Selected option"
          value={grand.options_price_cents}
          dim={selectedVariant !== quote.selected_variant}
        />
        {grand.addons_price_cents > 0 && (
          <TotalRow label="Selected add-ons" value={grand.addons_price_cents} />
        )}
        {grand.discount_cents > 0 && (
          <TotalRow
            label="Discounts"
            value={-grand.discount_cents}
            danger
          />
        )}
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-[var(--color-border)]">
          <span
            className="text-sm uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
          >
            Total
          </span>
          <span className="text-xl tabular-nums [font-family:var(--font-mono)] text-[var(--color-green)]">
            {moneyWhole(grand.grand_total_cents)}
          </span>
        </div>
        <div className="flex items-center justify-end text-xs text-[var(--color-muted)]">
          Realized margin {percent(grand.margin_fraction)}
        </div>
      </div>

      {!disabled && (
        <p className="text-xs text-[var(--color-muted)] mt-3">
          Tap an option to mark it as the customer's selection.
        </p>
      )}
    </Card>
  );
}

function TotalRow({
  label,
  value,
  dim,
  danger,
}: {
  label: string;
  value: number;
  dim?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={cn('text-[var(--color-muted)]', dim && 'opacity-60')}>{label}</span>
      <span
        className={cn(
          'tabular-nums [font-family:var(--font-mono)]',
          danger ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]',
          dim && 'opacity-60',
        )}
      >
        {money(value)}
      </span>
    </div>
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
// WORK ORDER CARD (description + customer-facing notes)
// =====================================================================

function WorkOrderCard({
  quote,
  disabled,
  onSave,
}: {
  quote: Quote;
  disabled: boolean;
  onSave: (args: {
    quoteId: string;
    patch: { work_order_description?: string | null; notes?: string | null };
  }) => Promise<Quote>;
}) {
  const [desc, setDesc] = useState(quote.work_order_description ?? '');
  const [notes, setNotes] = useState(quote.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty =
    (quote.work_order_description ?? '') !== desc ||
    (quote.notes ?? '') !== notes;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        quoteId: quote.id,
        patch: {
          work_order_description: desc || null,
          notes: notes || null,
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
        <CardTitle>Work Order</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-3">
        <FieldTextarea
          label="Scope of work"
          value={desc}
          onChange={setDesc}
          placeholder="e.g. Remove existing HVAC system and install entirely new heat pump…"
          rows={3}
          disabled={disabled}
        />
        <FieldTextarea
          label="Notes (customer-facing)"
          value={notes}
          onChange={setNotes}
          placeholder="Mass Save rebate amount, financing terms, etc."
          rows={4}
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
              {saving ? 'Saving…' : 'Save work order'}
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

/** Inline textarea component matching the Input visual style. */
function FieldTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-xs uppercase tracking-wider text-[var(--color-muted)]"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
      >
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={cn(
          'px-3 py-2 bg-[var(--color-carbon)] border rounded-[var(--radius-md)]',
          'text-[var(--color-text)] placeholder:text-[var(--color-muted)]',
          'focus:outline-none focus:border-[var(--color-green)]',
          'border-[var(--color-border)] resize-y',
          disabled && 'opacity-60',
        )}
      />
    </div>
  );
}

// =====================================================================
// ADD-ONS SECTION
// =====================================================================

function AddonsSection({
  quote,
  addons,
  linesByAddon,
  pricing,
  disabled,
  onAfterMutation,
}: {
  quote: Quote;
  addons: QuoteAddon[];
  linesByAddon: Map<string, QuoteLineItem[]>;
  pricing: PricingSettings | null;
  disabled: boolean;
  onAfterMutation: () => void;
}) {
  const createAddon = useCreateAddon();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Add-on Packages</CardTitle>
          <span className="text-xs text-[var(--color-muted)] uppercase tracking-wider">
            {addons.length} package{addons.length === 1 ? '' : 's'}
          </span>
        </div>
      </CardHeader>

      <div className="flex flex-col gap-4">
        {addons.length === 0 && (
          <p className="text-sm text-[var(--color-muted)]">
            None yet. {disabled ? '' : 'Add packages like UV Light, Humidifier, or Zoning that the customer can opt into.'}
          </p>
        )}

        {addons.map((addon) => (
          <AddonCard
            key={addon.id}
            quote={quote}
            addon={addon}
            lines={linesByAddon.get(addon.id) ?? []}
            pricing={pricing}
            disabled={disabled}
            onAfterMutation={onAfterMutation}
          />
        ))}

        {!disabled && (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await createAddon.mutateAsync({
                quoteId: quote.id,
                name: 'New add-on package',
                position: addons.length,
              });
            }}
            disabled={createAddon.isPending}
          >
            {createAddon.isPending ? 'Adding…' : '+ Add package'}
          </Button>
        )}
      </div>
    </Card>
  );
}

function AddonCard({
  quote,
  addon,
  lines,
  pricing,
  disabled,
  onAfterMutation,
}: {
  quote: Quote;
  addon: QuoteAddon;
  lines: QuoteLineItem[];
  pricing: PricingSettings | null;
  disabled: boolean;
  onAfterMutation: () => void;
}) {
  const [name, setName] = useState(addon.name);
  const [desc, setDesc] = useState(addon.description ?? '');
  const [adding, setAdding] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState<Item | null>(null);

  const updateAddon = useUpdateAddon();
  const deleteAddon = useDeleteAddon();
  const bulkAdd = useBulkAddLines();

  function closeAdd() {
    setAdding(false);
    setPendingItem(null);
  }

  async function handleQuickAdd(items: Item[]) {
    if (!pricing || items.length === 0) return;
    await bulkAdd.mutateAsync({
      quoteId: quote.id,
      pricing,
      lines: items.map((item, i) => ({
        line_type: item.line_type,
        description: cleanItemDescription(item.description),
        details: item.details,
        quantity: 1,
        unit_cost_cents: item.unit_cost_cents,
        // Lines inside an addon ignore variant — they roll up under the
        // addon, not under good/better/best.
        variant: 'all',
        item_id: item.id,
        position: lines.length + i,
        addon_id: addon.id,
      })),
    });
    onAfterMutation();
  }

  const headerDirty = name !== addon.name || (addon.description ?? '') !== desc;

  async function handleSaveHeader() {
    if (!headerDirty) return;
    await updateAddon.mutateAsync({
      addonId: addon.id,
      quoteId: quote.id,
      patch: { name, description: desc || null },
    });
  }

  async function handleToggleSelected() {
    await updateAddon.mutateAsync({
      addonId: addon.id,
      quoteId: quote.id,
      patch: { selected: !addon.selected },
    });
    onAfterMutation();
  }

  async function handleDelete() {
    if (!confirm(`Delete the "${addon.name}" add-on package and its ${lines.length} line(s)?`)) return;
    await deleteAddon.mutateAsync({ addonId: addon.id, quoteId: quote.id });
    onAfterMutation();
  }

  return (
    <div
      className={cn(
        'rounded-[var(--radius-md)] border p-3 flex flex-col gap-3',
        addon.selected
          ? 'border-[var(--color-green)] bg-[var(--color-carbon)]'
          : 'border-[var(--color-border)] bg-[var(--color-carbon)]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <Input
            label="Package name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
          />
          <FieldTextarea
            label="Description"
            value={desc}
            onChange={setDesc}
            placeholder="What does this package include?"
            rows={2}
            disabled={disabled}
          />
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleSelected}
            disabled={disabled || updateAddon.isPending}
            className={cn(
              'h-8 px-3 rounded-[var(--radius-sm)] text-xs uppercase tracking-wider font-semibold transition-all',
              addon.selected
                ? 'bg-[var(--color-green)] text-[var(--color-carbon)]'
                : 'bg-[var(--color-border)] text-[var(--color-muted)]',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            {addon.selected ? 'Selected' : 'Not selected'}
          </button>
          <div className="text-base tabular-nums [font-family:var(--font-mono)] text-[var(--color-text)]">
            {money(addon.total_cents)}
          </div>
        </div>
      </div>

      {!disabled && headerDirty && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={handleSaveHeader} disabled={updateAddon.isPending}>
            {updateAddon.isPending ? 'Saving…' : 'Save header'}
          </Button>
        </div>
      )}

      {/* Lines belonging to this addon */}
      <div className="flex flex-col gap-2 pt-2 border-t border-[var(--color-border)]">
        <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
          Lines ({lines.length})
        </span>
        {pricing &&
          lines.map((line) => (
            <LineEditor
              key={line.id}
              line={line}
              quoteId={quote.id}
              pricing={pricing}
              disabled={disabled}
              onAfterMutation={onAfterMutation}
              addonId={addon.id}
            />
          ))}
        {adding && pricing && (
          <LineEditor
            key={pendingItem ? `new-${pendingItem.id}` : 'new'}
            line={null}
            initialItem={pendingItem}
            quoteId={quote.id}
            pricing={pricing}
            disabled={false}
            onAfterMutation={() => {
              closeAdd();
              onAfterMutation();
            }}
            onCancel={closeAdd}
            addonId={addon.id}
          />
        )}
        {!disabled && !adding && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPickerOpen(true)}
            disabled={!pricing}
          >
            + Add line to package
          </Button>
        )}
      </div>

      <ItemPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(result) => {
          setPickerOpen(false);
          if (result.kind === 'items') {
            void handleQuickAdd(result.items);
            return;
          }
          setPendingItem(null);
          setAdding(true);
        }}
      />

      {!disabled && (
        <div className="flex justify-end pt-2 border-t border-[var(--color-border)]">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleteAddon.isPending}
          >
            {deleteAddon.isPending ? 'Deleting…' : 'Delete package'}
          </Button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// DISCOUNTS SECTION
// =====================================================================

function DiscountsSection({
  quote,
  discounts,
  disabled,
  onAfterMutation,
}: {
  quote: Quote;
  discounts: QuoteDiscount[];
  disabled: boolean;
  onAfterMutation: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState(0);

  const createDiscount = useCreateDiscount();
  const deleteDiscount = useDeleteDiscount();

  async function handleAdd() {
    if (!label.trim() || amount <= 0) return;
    await createDiscount.mutateAsync({
      quoteId: quote.id,
      label: label.trim(),
      amount_cents: amount,
      position: discounts.length,
    });
    setLabel('');
    setAmount(0);
    setAdding(false);
    onAfterMutation();
  }

  async function handleDelete(d: QuoteDiscount) {
    if (!confirm(`Remove discount "${d.label}"?`)) return;
    await deleteDiscount.mutateAsync({ discountId: d.id, quoteId: quote.id });
    onAfterMutation();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Discounts</CardTitle>
          <span className="text-xs text-[var(--color-muted)] uppercase tracking-wider">
            {discounts.length} applied
          </span>
        </div>
      </CardHeader>

      <div className="flex flex-col gap-2">
        {discounts.length === 0 && !adding && (
          <p className="text-sm text-[var(--color-muted)]">
            None applied. {disabled ? '' : 'Add a discount to subtract from the grand total (e.g., Condenser Match Discount, Mass Save rebate).'}
          </p>
        )}

        {discounts.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] p-2 bg-[var(--color-carbon)]"
          >
            <div className="flex flex-col">
              <span className="text-sm">{d.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm tabular-nums [font-family:var(--font-mono)] text-[var(--color-danger)]">
                −{money(d.amount_cents)}
              </span>
              {!disabled && (
                <Button variant="ghost" size="sm" onClick={() => handleDelete(d)}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        ))}

        {adding && !disabled && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-green)] p-3 bg-[var(--color-carbon)] flex flex-col gap-3">
            <Input
              label="Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Condenser Match Discount"
            />
            <MoneyInput label="Amount" value={amount} onChange={setAmount} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setLabel(''); setAmount(0); }}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAdd}
                disabled={!label.trim() || amount <= 0 || createDiscount.isPending}
              >
                {createDiscount.isPending ? 'Adding…' : 'Add discount'}
              </Button>
            </div>
          </div>
        )}

        {!disabled && !adding && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            + Add discount
          </Button>
        )}
      </div>
    </Card>
  );
}

// =====================================================================
// HELPERS
// =====================================================================

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
