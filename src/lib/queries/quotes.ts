import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { priceLine, priceQuote } from '@/lib/pricing';
import type {
  CostBasis,
  PricedLine,
  PricingResult,
  PricingSettings,
} from '@/lib/pricing/types';
import type {
  CompanySettings,
  PricingSnapshot,
  Quote,
  QuoteInsert,
  QuoteLineItem,
  QuoteLineItemInsert,
  QuoteLineItemUpdate,
  QuoteUpdate,
} from '@/types/database';

/**
 * Quote data hooks.
 *
 * Pattern mirrors company.ts: untyped Supabase client, explicit casts at
 * the boundary, RLS handles tenant scoping.
 *
 * Pricing flow:
 *   - Lines persist their `unit_price_cents` at save time, computed from
 *     the snapshot (if frozen) or current settings (if draft/in_progress).
 *   - Quote-level totals (`subtotal_cents`, `total_cents`) are written by
 *     useRecalcQuoteTotals after any line change. They reflect the
 *     *currently-selected* GBB variant — or the 'better' total when no
 *     variant has been picked yet.
 *   - "Mark ready" runs a coherent re-pricing pass on every line, freezes
 *     the snapshot, and flips status. Once `ready`, lines stop being
 *     touched until/unless the quote drops back to `in_progress`.
 */

const QUOTES_KEY = ['quotes'] as const;
const QUOTE_KEY = (id: string) => ['quote', id] as const;
const QUOTE_LINES_KEY = (id: string) => ['quote-lines', id] as const;

// ---------------------------------------------------------------------
// Snapshot ↔ PricingSettings adapters
// ---------------------------------------------------------------------

/** Pull a PricingSettings out of a CompanySettings row (for live pricing). */
export function settingsToPricing(s: CompanySettings): PricingSettings {
  return {
    pricing_mode: s.pricing_mode,
    default_markup: Number(s.default_markup),
    default_margin: Number(s.default_margin),
    markup_tiers: s.markup_tiers ?? [],
    margin_tiers: s.margin_tiers ?? [],
    state_tax_rate: Number(s.state_tax_rate),
    cost_basis: s.webb_cost_basis as CostBasis,
  };
}

/** Pull a PricingSettings out of a frozen snapshot (for sent/ready quotes). */
export function snapshotToPricing(snap: PricingSnapshot): PricingSettings {
  return {
    pricing_mode: snap.pricing_mode,
    default_markup: snap.default_markup,
    default_margin: snap.default_margin,
    markup_tiers: snap.markup_tiers,
    margin_tiers: snap.margin_tiers,
    state_tax_rate: snap.state_tax_rate,
    cost_basis: snap.cost_basis,
  };
}

/** Take a snapshot of the current settings (used on "Mark ready"). */
export function takeSnapshot(s: CompanySettings): PricingSnapshot {
  return {
    pricing_mode: s.pricing_mode,
    default_markup: Number(s.default_markup),
    default_margin: Number(s.default_margin),
    markup_tiers: s.markup_tiers ?? [],
    margin_tiers: s.margin_tiers ?? [],
    state_tax_rate: Number(s.state_tax_rate),
    cost_basis: s.webb_cost_basis,
    snapshotted_at: new Date().toISOString(),
  };
}

/**
 * Pick which PricingSettings a quote should be priced against.
 * - Frozen quotes (status past `in_progress`) use the snapshot.
 * - Draft / in_progress quotes use live company settings.
 * Returns null if neither is available (caller should bail).
 */
export function effectivePricing(
  quote: Pick<Quote, 'status' | 'pricing_snapshot'>,
  liveSettings: CompanySettings | null | undefined,
): PricingSettings | null {
  const isFrozen =
    quote.status !== 'draft' && quote.status !== 'in_progress';
  if (isFrozen && quote.pricing_snapshot) {
    return snapshotToPricing(quote.pricing_snapshot);
  }
  if (liveSettings) return settingsToPricing(liveSettings);
  return null;
}

// ---------------------------------------------------------------------
// useQuotes — list quotes for the current company (RLS-filtered)
// ---------------------------------------------------------------------

async function fetchQuotes(companyId: string): Promise<Quote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Quote[];
}

export function useQuotes(companyId: string | undefined) {
  return useQuery({
    queryKey: [...QUOTES_KEY, companyId],
    queryFn: () => fetchQuotes(companyId!),
    enabled: !!companyId,
  });
}

// ---------------------------------------------------------------------
// useQuote / useQuoteLines — single quote + its lines
// ---------------------------------------------------------------------

async function fetchQuote(quoteId: string): Promise<Quote | null> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .maybeSingle();
  if (error) throw error;
  return (data as Quote | null) ?? null;
}

async function fetchQuoteLines(quoteId: string): Promise<QuoteLineItem[]> {
  const { data, error } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', quoteId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as QuoteLineItem[];
}

export function useQuote(quoteId: string | undefined) {
  return useQuery({
    queryKey: quoteId ? QUOTE_KEY(quoteId) : ['quote', 'none'],
    queryFn: () => fetchQuote(quoteId!),
    enabled: !!quoteId,
  });
}

export function useQuoteLines(quoteId: string | undefined) {
  return useQuery({
    queryKey: quoteId ? QUOTE_LINES_KEY(quoteId) : ['quote-lines', 'none'],
    queryFn: () => fetchQuoteLines(quoteId!),
    enabled: !!quoteId,
  });
}

// ---------------------------------------------------------------------
// useCreateQuote — insert a draft and return it
// ---------------------------------------------------------------------

async function createQuote(args: {
  tenant_id: string;
  company_id: string;
  module: Quote['module'];
  customer_name?: string | null;
  customer_address?: string | null;
}): Promise<Quote> {
  const insert: QuoteInsert = {
    tenant_id: args.tenant_id,
    company_id: args.company_id,
    module: args.module,
    customer_name: args.customer_name ?? null,
    customer_address: args.customer_address ?? null,
    status: 'draft',
    fp_job_id: null,
    fp_quote_id: null,
    video_path: null,
    video_uploaded_at: null,
    pricing_snapshot: null,
    selected_variant: null,
    created_by: null, // RLS / DB default may set this; we don't trust the client
  };
  const { data, error } = await supabase
    .from('quotes')
    .insert(insert as Record<string, unknown>)
    .select('*')
    .single();
  if (error) throw error;
  return data as Quote;
}

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createQuote,
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: [...QUOTES_KEY, quote.company_id] });
      qc.setQueryData(QUOTE_KEY(quote.id), quote);
    },
  });
}

// ---------------------------------------------------------------------
// useUpdateQuote — patch quote-level fields
// ---------------------------------------------------------------------

async function updateQuote(args: {
  quoteId: string;
  patch: QuoteUpdate;
}): Promise<Quote> {
  const { data, error } = await supabase
    .from('quotes')
    .update(args.patch as Record<string, unknown>)
    .eq('id', args.quoteId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Quote;
}

export function useUpdateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateQuote,
    onSuccess: (quote) => {
      qc.setQueryData(QUOTE_KEY(quote.id), quote);
      qc.invalidateQueries({ queryKey: [...QUOTES_KEY, quote.company_id] });
    },
  });
}

// ---------------------------------------------------------------------
// useDeleteQuote
// ---------------------------------------------------------------------

async function deleteQuote(quoteId: string): Promise<void> {
  const { error } = await supabase.from('quotes').delete().eq('id', quoteId);
  if (error) throw error;
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteQuote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUOTES_KEY });
    },
  });
}

// ---------------------------------------------------------------------
// LINE MUTATIONS
// ---------------------------------------------------------------------
// Each mutation computes `unit_price_cents` from the supplied
// PricingSettings before persisting, so the row stored in the DB
// matches what the editor was showing at the moment of save.

interface AddLineArgs {
  quoteId: string;
  line: Omit<QuoteLineItemInsert, 'quote_id' | 'unit_price_cents'>;
  pricing: PricingSettings;
}

async function addLine({ quoteId, line, pricing }: AddLineArgs): Promise<QuoteLineItem> {
  const priced = priceLine(
    {
      line_type: line.line_type,
      description: line.description,
      quantity: line.quantity,
      unit_cost_cents: line.unit_cost_cents,
      variant: line.variant,
    },
    pricing,
  );
  const insert: QuoteLineItemInsert = {
    ...line,
    quote_id: quoteId,
    unit_price_cents: priced.unit_price_cents,
  };
  const { data, error } = await supabase
    .from('quote_line_items')
    .insert(insert as Record<string, unknown>)
    .select('*')
    .single();
  if (error) throw error;
  return data as QuoteLineItem;
}

export function useAddLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addLine,
    onSuccess: (line) => {
      qc.invalidateQueries({ queryKey: QUOTE_LINES_KEY(line.quote_id) });
    },
  });
}

interface UpdateLineArgs {
  lineId: string;
  quoteId: string;
  patch: QuoteLineItemUpdate;
  /** Provide pricing so we can recompute unit_price_cents on the new cost. */
  pricing: PricingSettings;
}

async function updateLine({ lineId, patch, pricing }: UpdateLineArgs): Promise<QuoteLineItem> {
  // Read the current row so we can re-price even when only the cost changed.
  const { data: current, error: readErr } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('id', lineId)
    .single();
  if (readErr) throw readErr;
  const merged = { ...(current as QuoteLineItem), ...patch };
  const priced = priceLine(
    {
      line_type: merged.line_type,
      description: merged.description,
      quantity: merged.quantity,
      unit_cost_cents: merged.unit_cost_cents,
      variant: merged.variant,
    },
    pricing,
  );
  const fullPatch = { ...patch, unit_price_cents: priced.unit_price_cents };
  const { data, error } = await supabase
    .from('quote_line_items')
    .update(fullPatch as Record<string, unknown>)
    .eq('id', lineId)
    .select('*')
    .single();
  if (error) throw error;
  return data as QuoteLineItem;
}

export function useUpdateLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateLine,
    onSuccess: (line) => {
      qc.invalidateQueries({ queryKey: QUOTE_LINES_KEY(line.quote_id) });
    },
  });
}

interface DeleteLineArgs {
  lineId: string;
  quoteId: string;
}

async function deleteLine({ lineId }: DeleteLineArgs): Promise<void> {
  const { error } = await supabase.from('quote_line_items').delete().eq('id', lineId);
  if (error) throw error;
}

export function useDeleteLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteLine,
    onSuccess: (_v, args) => {
      qc.invalidateQueries({ queryKey: QUOTE_LINES_KEY(args.quoteId) });
    },
  });
}

// ---------------------------------------------------------------------
// PRICE-COMPUTING HELPER
// ---------------------------------------------------------------------

/**
 * Given lines + pricing, compute a full PricingResult.
 * Used both for the live editor display and for total recalculation.
 */
export function computeQuoteResult(
  lines: QuoteLineItem[],
  pricing: PricingSettings,
): PricingResult {
  return priceQuote(
    lines.map((l) => ({
      line_type: l.line_type,
      description: l.description,
      quantity: Number(l.quantity),
      unit_cost_cents: l.unit_cost_cents,
      variant: l.variant,
    })),
    pricing,
  );
}

/**
 * Pick the displayed total for a quote.
 *  - If a variant has been selected, use that variant's price.
 *  - Otherwise, default to 'better' (the middle option) so the list view
 *    has something sensible to show.
 */
export function pickHeadlineTotal(
  result: PricingResult,
  selected: Quote['selected_variant'],
): { cost_cents: number; price_cents: number } {
  const v = selected ?? 'better';
  const t = result.variants[v];
  return { cost_cents: t.cost_total_cents, price_cents: t.price_total_cents };
}

// ---------------------------------------------------------------------
// useRecalcQuoteTotals — re-fetch lines, recompute, write back to quote
// ---------------------------------------------------------------------

interface RecalcArgs {
  quoteId: string;
  pricing: PricingSettings;
  selected_variant: Quote['selected_variant'];
}

async function recalcQuoteTotals({
  quoteId,
  pricing,
  selected_variant,
}: RecalcArgs): Promise<Quote> {
  const lines = await fetchQuoteLines(quoteId);
  const result = computeQuoteResult(lines, pricing);
  const { cost_cents, price_cents } = pickHeadlineTotal(result, selected_variant);
  const { data, error } = await supabase
    .from('quotes')
    .update({
      subtotal_cents: cost_cents,
      total_cents: price_cents,
    } as Record<string, unknown>)
    .eq('id', quoteId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Quote;
}

export function useRecalcQuoteTotals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: recalcQuoteTotals,
    onSuccess: (quote) => {
      qc.setQueryData(QUOTE_KEY(quote.id), quote);
      qc.invalidateQueries({ queryKey: [...QUOTES_KEY, quote.company_id] });
    },
  });
}

// ---------------------------------------------------------------------
// useMarkReady — coherent re-pricing pass + snapshot + status flip
// ---------------------------------------------------------------------

/**
 * Re-prices every line against current settings, writes the snapshot,
 * sets status to 'ready', and rewrites totals. Once this completes, the
 * quote is frozen against settings drift until/unless it's reopened.
 *
 * Done client-side rather than via a stored proc because the pricing
 * engine lives in TS — keeping a single source of truth means we don't
 * have to mirror priceLine() into PL/pgSQL.
 */
interface MarkReadyArgs {
  quote: Quote;
  liveSettings: CompanySettings;
}

async function markReady({ quote, liveSettings }: MarkReadyArgs): Promise<Quote> {
  const pricing = settingsToPricing(liveSettings);
  const snapshot = takeSnapshot(liveSettings);

  // 1. Re-price all lines so each row's stored unit_price_cents is
  //    coherent with the snapshot we're about to freeze.
  const lines = await fetchQuoteLines(quote.id);
  const repriced: PricedLine[] = lines.map((l) =>
    priceLine(
      {
        line_type: l.line_type,
        description: l.description,
        quantity: Number(l.quantity),
        unit_cost_cents: l.unit_cost_cents,
        variant: l.variant,
      },
      pricing,
    ),
  );

  // Update each line whose unit_price_cents drifted. Sequential rather
  // than Promise.all so ordering / RLS errors surface predictably.
  for (let i = 0; i < lines.length; i++) {
    const before = lines[i];
    const after = repriced[i];
    if (before.unit_price_cents !== after.unit_price_cents) {
      const { error } = await supabase
        .from('quote_line_items')
        .update({
          unit_price_cents: after.unit_price_cents,
        } as Record<string, unknown>)
        .eq('id', before.id);
      if (error) throw error;
    }
  }

  // 2. Compute totals against the just-frozen snapshot.
  const result = computeQuoteResult(lines, pricing);
  const { cost_cents, price_cents } = pickHeadlineTotal(
    result,
    quote.selected_variant,
  );

  // 3. Write snapshot + totals + status flip in one update.
  const patch: QuoteUpdate = {
    pricing_snapshot: snapshot,
    subtotal_cents: cost_cents,
    total_cents: price_cents,
    status: 'ready',
  };
  const { data, error } = await supabase
    .from('quotes')
    .update(patch as Record<string, unknown>)
    .eq('id', quote.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Quote;
}

export function useMarkReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markReady,
    onSuccess: (quote) => {
      qc.setQueryData(QUOTE_KEY(quote.id), quote);
      qc.invalidateQueries({ queryKey: QUOTE_LINES_KEY(quote.id) });
      qc.invalidateQueries({ queryKey: [...QUOTES_KEY, quote.company_id] });
    },
  });
}

// ---------------------------------------------------------------------
// useReopenQuote — drop a `ready` quote back to `in_progress`
// ---------------------------------------------------------------------
// Useful escape hatch while we don't have the FP integration. Leaves the
// snapshot in place — re-marking ready will overwrite it anyway.

export function useReopenQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (quoteId: string) => {
      const { data, error } = await supabase
        .from('quotes')
        .update({ status: 'in_progress' } as Record<string, unknown>)
        .eq('id', quoteId)
        .select('*')
        .single();
      if (error) throw error;
      return data as Quote;
    },
    onSuccess: (quote) => {
      qc.setQueryData(QUOTE_KEY(quote.id), quote);
      qc.invalidateQueries({ queryKey: [...QUOTES_KEY, quote.company_id] });
    },
  });
}
