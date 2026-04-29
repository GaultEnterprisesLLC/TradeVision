import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { useCompany, useCompanySettings } from '@/lib/queries/company';
import { useSearchableItems } from '@/lib/queries/items';
import {
  settingsToPricing,
  useBulkAddLines,
  useCreateQuote,
  useUpdateQuote,
} from '@/lib/queries/quotes';
import { findBestCatalogMatches, cleanItemDescription } from '@/lib/items';
import type { CatalogMatch, SearchableItem } from '@/lib/items';
import type { Item, LineType, Variant } from '@/types/database';

/**
 * /quotes/new/narrate — Stage 4A
 *
 * Voice-first quote creation. Contractor types (or pastes from a phone-
 * recorded transcription) a narration of the job; we POST it to the
 * /api/parse-narration Edge Function, which calls Gemini to produce a
 * structured draft (customer, scope, line items). We then fuzzy-match
 * each AI-suggested line against the 879-item catalog. The user
 * reviews the draft, swaps mis-matched lines if needed, and creates
 * the quote in one click — landing in the existing /quotes/:id/edit
 * for any fine-tuning.
 *
 * Why this order matters: keep the contractor in the field. The
 * narration is the input device; the catalog match takes the cognitive
 * lift off them; the existing editor is the escape hatch for anything
 * the AI missed.
 */

interface AILineItem {
  description: string;
  quantity: number;
  line_type: LineType;
}

interface ParsedNarration {
  customer_name?: string;
  customer_address?: string;
  job_type: string;
  work_order_description: string;
  line_items: AILineItem[];
}

/** A single line in the review screen — AI's suggestion + chosen catalog match. */
interface ReviewLine {
  id: string; // local id for React key
  ai: AILineItem;
  match: CatalogMatch | null;
  alternatives: CatalogMatch[];
  /** null = "no match found / use AI description as custom line" */
  chosen: Item | null;
}

const SAMPLE_NARRATION = `Heat pump consult for the Smith household at 12 Pleasant Street, East Falmouth.

We're installing a 5-ton Ecoer heat pump with mini-ducted air handler for the main house. About 3 days of HVAC labor for the install. Need a Manual J and Manual D up front.

Recovery labor and exchange tank for the existing R-410A. Demo the old oil tank.

Add a UV light, a surge protector, and zoning kit for both floors.`;

export default function Narrate() {
  const navigate = useNavigate();
  const { data: company } = useCompany();
  const { data: liveSettings } = useCompanySettings(company?.id);
  const { data: indexedItems } = useSearchableItems();

  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();
  const bulkAddLines = useBulkAddLines();

  // ---------- input state ----------
  const [narration, setNarration] = useState('');
  const [generating, setGenerating] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // ---------- review state (after parsing) ----------
  const [parsed, setParsed] = useState<ParsedNarration | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [jobType, setJobType] = useState('');
  const [workOrderDescription, setWorkOrderDescription] = useState('');
  const [reviewLines, setReviewLines] = useState<ReviewLine[]>([]);
  const [creating, setCreating] = useState(false);

  // Recompute matches if the catalog finishes loading after parsing.
  // (Edge case: user submits before the catalog query has resolved.)
  useEffect(() => {
    if (!parsed || !indexedItems || reviewLines.length > 0) return;
    setReviewLines(matchAILines(parsed.line_items, indexedItems));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, indexedItems]);

  async function handleGenerate() {
    if (!narration.trim()) return;
    setGenerating(true);
    setParseError(null);
    try {
      const res = await fetch('/api/parse-narration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narration }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface the API's `detail` field so failures are diagnosable
        // without opening devtools. Common case: OpenAI returns a quota /
        // model / schema error and we want to see what.
        const detailStr = body.detail
          ? typeof body.detail === 'string'
            ? body.detail
            : JSON.stringify(body.detail).slice(0, 300)
          : '';
        const msg = body.error ?? `HTTP ${res.status}`;
        throw new Error(detailStr ? `${msg} — ${detailStr}` : msg);
      }
      const data = body as ParsedNarration;
      setParsed(data);
      setCustomerName(data.customer_name ?? '');
      setCustomerAddress(data.customer_address ?? '');
      setJobType(data.job_type);
      setWorkOrderDescription(data.work_order_description);
      setReviewLines(matchAILines(data.line_items, indexedItems ?? []));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreateQuote() {
    if (!company || !liveSettings) return;
    setCreating(true);
    try {
      const pricing = settingsToPricing(liveSettings);

      // 1. Create the quote with module = job_type (free text after 0008).
      const quote = await createQuote.mutateAsync({
        tenant_id: company.tenant_id,
        company_id: company.id,
        module: jobType || 'Service call',
        customer_name: customerName || null,
        customer_address: customerAddress || null,
      });

      // 2. Set work_order_description on the new quote (separate hop —
      //    useCreateQuote doesn't accept it yet to keep its signature
      //    minimal).
      if (workOrderDescription) {
        await updateQuote.mutateAsync({
          quoteId: quote.id,
          patch: { work_order_description: workOrderDescription },
        });
      }

      // 3. Bulk-add lines. Matched catalog items use catalog values;
      //    unmatched lines become custom lines with the AI's description
      //    and $0 cost (user fills in via the editor).
      const linesToAdd = reviewLines.map((rl) => {
        if (rl.chosen) {
          return {
            line_type: rl.chosen.line_type,
            description: rl.chosen.description,
            details: rl.chosen.details,
            quantity: rl.ai.quantity,
            unit_cost_cents: rl.chosen.unit_cost_cents,
            variant: 'all' as Variant,
            item_id: rl.chosen.id,
            position: 0,
            addon_id: null,
          };
        }
        return {
          line_type: rl.ai.line_type,
          description: rl.ai.description,
          details: null,
          quantity: rl.ai.quantity,
          unit_cost_cents: 0,
          variant: 'all' as Variant,
          item_id: null,
          position: 0,
          addon_id: null,
        };
      });

      if (linesToAdd.length > 0) {
        await bulkAddLines.mutateAsync({
          quoteId: quote.id,
          lines: linesToAdd,
          pricing,
        });
      }

      navigate(`/quotes/${quote.id}/edit`);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  function chooseAlternative(reviewLineId: string, item: Item | null) {
    setReviewLines((prev) =>
      prev.map((rl) => (rl.id === reviewLineId ? { ...rl, chosen: item } : rl)),
    );
  }

  function removeReviewLine(reviewLineId: string) {
    setReviewLines((prev) => prev.filter((rl) => rl.id !== reviewLineId));
  }

  function adjustQuantity(reviewLineId: string, qty: number) {
    setReviewLines((prev) =>
      prev.map((rl) =>
        rl.id === reviewLineId ? { ...rl, ai: { ...rl.ai, quantity: qty } } : rl,
      ),
    );
  }

  // ---------- derived values (must be above any early return) ----------
  const totalEstimateCents = useMemo(
    () =>
      reviewLines.reduce((sum, rl) => {
        const unit = rl.chosen?.unit_cost_cents ?? 0;
        return sum + unit * rl.ai.quantity;
      }, 0),
    [reviewLines],
  );
  const showReview = parsed !== null;

  // ---------- render guards ----------
  if (!company) {
    return (
      <div className="px-4 py-12 text-center text-sm text-[var(--color-muted)]">
        Loading company…
      </div>
    );
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link
            to="/new"
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            ← New
          </Link>
          <h1 className="mt-1">Narrate the job</h1>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            Describe the work in plain English. AI builds the quote.
          </p>
        </div>
      </header>

      {!showReview && (
        <Card>
          <CardHeader>
            <CardTitle>What's the job?</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-3">
            <textarea
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder={SAMPLE_NARRATION}
              rows={12}
              disabled={generating}
              className={cn(
                'px-3 py-2 bg-[var(--color-carbon)] border rounded-[var(--radius-md)]',
                'text-[var(--color-text)] placeholder:text-[var(--color-muted)]',
                'focus:outline-none focus:border-[var(--color-green)]',
                'border-[var(--color-border)] resize-y',
                'text-sm leading-relaxed',
              )}
            />
            <p className="text-xs text-[var(--color-muted)]">
              Mention customer name, address, equipment, labor days, and any
              add-ons. The more specific you are about brand/size, the better
              the catalog match.
            </p>
            {parseError && (
              <p className="text-sm text-[var(--color-danger)]">
                {parseError}
              </p>
            )}
            <div className="flex items-center gap-3">
              <Button
                fullWidth
                size="lg"
                onClick={handleGenerate}
                disabled={!narration.trim() || generating}
              >
                {generating ? 'Generating…' : 'Generate Quote'}
              </Button>
            </div>
            {!narration.trim() && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNarration(SAMPLE_NARRATION)}
              >
                Use sample narration
              </Button>
            )}
          </div>
        </Card>
      )}

      {showReview && parsed && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Draft quote</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setParsed(null);
                    setReviewLines([]);
                    setParseError(null);
                  }}
                >
                  Start over
                </Button>
              </div>
            </CardHeader>
            <div className="flex flex-col gap-3">
              <Input
                label="Job type"
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
              />
              <Input
                label="Customer name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Mrs. Smith"
              />
              <Input
                label="Customer address"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="12 Pleasant St, East Falmouth, MA"
              />
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs uppercase tracking-wider text-[var(--color-muted)]"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
                >
                  Scope of work
                </label>
                <textarea
                  value={workOrderDescription}
                  onChange={(e) => setWorkOrderDescription(e.target.value)}
                  rows={3}
                  className={cn(
                    'px-3 py-2 bg-[var(--color-carbon)] border rounded-[var(--radius-md)]',
                    'text-[var(--color-text)]',
                    'focus:outline-none focus:border-[var(--color-green)]',
                    'border-[var(--color-border)] resize-y text-sm',
                  )}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Line items ({reviewLines.length})</CardTitle>
                <span className="text-xs text-[var(--color-muted)]">
                  Estimated cost {money(totalEstimateCents)}
                </span>
              </div>
            </CardHeader>
            <div className="flex flex-col gap-3">
              {reviewLines.length === 0 && (
                <p className="text-sm text-[var(--color-muted)]">
                  No line items extracted from the narration.
                </p>
              )}
              {reviewLines.map((rl) => (
                <ReviewLineCard
                  key={rl.id}
                  reviewLine={rl}
                  onChoose={(item) => chooseAlternative(rl.id, item)}
                  onRemove={() => removeReviewLine(rl.id)}
                  onQty={(q) => adjustQuantity(rl.id, q)}
                />
              ))}
              <p className="text-xs text-[var(--color-muted)]">
                After creating the quote you can refine line items, add
                Options or Add-on Packages, and tweak prices in the editor.
              </p>
            </div>
          </Card>

          <div className="flex flex-col gap-2">
            <Button
              fullWidth
              size="lg"
              onClick={handleCreateQuote}
              disabled={creating}
            >
              {creating ? 'Creating quote…' : 'Create Quote'}
            </Button>
            {parseError && (
              <p className="text-sm text-[var(--color-danger)] text-center">
                {parseError}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// ReviewLineCard — one card per AI-extracted line
// ---------------------------------------------------------------------

function ReviewLineCard({
  reviewLine,
  onChoose,
  onRemove,
  onQty,
}: {
  reviewLine: ReviewLine;
  onChoose: (item: Item | null) => void;
  onRemove: () => void;
  onQty: (qty: number) => void;
}) {
  const { ai, match, alternatives, chosen } = reviewLine;
  const lineTotal = (chosen?.unit_cost_cents ?? 0) * ai.quantity;

  // Combine match + alternatives for the dropdown — chosen item is
  // included in case the user previously swapped to an alternative.
  const allOptions = useMemo(() => {
    const opts: CatalogMatch[] = [];
    if (match) opts.push(match);
    for (const alt of alternatives) {
      if (alt.item.id !== match?.item.id) opts.push(alt);
    }
    return opts;
  }, [match, alternatives]);

  return (
    <div
      className={cn(
        'rounded-[var(--radius-md)] border p-3 flex flex-col gap-2',
        chosen
          ? 'border-[var(--color-border)] bg-[var(--color-carbon)]'
          : 'border-[var(--color-danger)] bg-[var(--color-carbon)]',
      )}
    >
      {/* AI's suggestion (the source) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
            From narration · {ai.line_type}
          </span>
          <span className="text-sm">{ai.description}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="number"
            inputMode="decimal"
            value={ai.quantity}
            min={0}
            onChange={(e) => onQty(Number(e.target.value))}
            className={cn(
              'h-8 w-16 px-2 bg-[var(--color-carbon)] border border-[var(--color-border)] rounded-[var(--radius-sm)]',
              'text-sm text-right tabular-nums [font-family:var(--font-mono)]',
              'focus:outline-none focus:border-[var(--color-green)]',
            )}
          />
        </div>
      </div>

      {/* Catalog match (or "no match") */}
      {allOptions.length > 0 ? (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--color-border)]">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
            Matched catalog item
          </span>
          <Select
            value={chosen?.id ?? ''}
            onChange={(e) => {
              const itemId = e.target.value;
              if (!itemId) {
                onChoose(null);
                return;
              }
              const opt = allOptions.find((o) => o.item.id === itemId);
              onChoose(opt?.item ?? null);
            }}
          >
            <option value="">— No match (custom line) —</option>
            {allOptions.map((opt) => (
              <option key={opt.item.id} value={opt.item.id}>
                {cleanItemDescription(opt.item.description)} ·{' '}
                {money(opt.item.unit_cost_cents)}
                {' '}({Math.round(opt.score * 100)}%)
              </option>
            ))}
          </Select>
          {chosen && (
            <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
              <span className="tabular-nums [font-family:var(--font-mono)]">
                {money(chosen.unit_cost_cents)} × {ai.quantity}
              </span>
              <span className="tabular-nums [font-family:var(--font-mono)] text-[var(--color-text)]">
                {money(lineTotal)}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--color-border)]">
          <span className="text-xs text-[var(--color-danger)]">
            No catalog match. Will be added as a custom line at $0 — fill in
            the cost in the editor.
          </span>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function matchAILines(
  aiLines: AILineItem[],
  indexed: SearchableItem[],
): ReviewLine[] {
  return aiLines.map((line, i) => {
    const matches = findBestCatalogMatches(line.description, indexed, {
      preferLineType: line.line_type,
      limit: 5,
    });
    return {
      id: `ai-${i}-${Date.now()}`,
      ai: line,
      match: matches[0] ?? null,
      alternatives: matches.slice(1),
      chosen: matches[0]?.item ?? null,
    };
  });
}
