/**
 * composeQuoteForPDF — pure data shaper.
 *
 * Takes the raw rows that come back from Supabase + the engine result and
 * folds them into a PDF-ready document model. The PDF component reads
 * straight from this shape; no further computation in the renderer.
 *
 * Why pure? Two reasons:
 *  1. Testable. The PDF visual layer is hard to unit-test (it's a render
 *     tree against custom primitives). The shaping is where bugs hide —
 *     "did I include unselected addons in the total?" — and we test that
 *     directly.
 *  2. Reusable. Same shape can drive an HTML preview, a print stylesheet,
 *     a future native share intent, etc.
 */

import { computeGrandTotal, priceQuote } from '@/lib/pricing';
import type {
  GrandTotalResult,
  PricedLine,
  PricingResult,
  PricingSettings,
  Variant,
} from '@/lib/pricing/types';
import type {
  Company,
  Quote,
  QuoteAddon,
  QuoteDiscount,
  QuoteLineItem,
  SelectedVariant,
} from '@/types/database';

/** Module label for the header bar. Mirrors routes/Quotes.tsx. */
export const MODULE_LABELS: Record<Quote['module'], string> = {
  hvac: 'HVAC Changeout',
  generator: 'Generator',
  water_heater: 'Water Heater',
  boiler: 'Boiler',
  plumbing_service: 'Plumbing Service',
  plumbing_new_construction: 'New Construction',
};

/** A line as it appears in the PDF (after engine pricing). */
export interface PDFLine {
  id: string;
  description: string;
  details: string | null;
  quantity: number;
  unit_price_cents: number;
  line_total_price_cents: number;
}

/** Per-Option roll-up (one for each of good/better/best that has any lines). */
export interface PDFOption {
  variant: SelectedVariant;
  /** Per-quote label if set ("Ecoer 5T HP"); otherwise the capitalized variant. */
  label: string;
  is_selected: boolean;
  lines: PDFLine[];
  /** Lines flagged variant='all' on the source quote — appear under every Option. */
  shared_lines: PDFLine[];
  cost_total_cents: number;
  price_total_cents: number;
}

/** Per-addon-package roll-up. */
export interface PDFAddon {
  id: string;
  name: string;
  description: string | null;
  is_selected: boolean;
  lines: PDFLine[];
  total_cents: number;
}

export interface PDFDocumentModel {
  /** Header info. */
  company: Company;
  quote: Quote;
  module_label: string;
  /** Display-friendly date strings. */
  created_date: string;
  quote_number: string;

  /** Either the customer's chosen variant OR 'better' as a sensible default. */
  selected_variant: SelectedVariant;

  /** Options that have at least one line. */
  options: PDFOption[];
  /** Lines with variant='all' (shared across every Option). */
  shared_lines: PDFLine[];

  /** Add-on packages. Both selected and unselected are surfaced — the PDF
   *  shows unselected ones as "Available add-ons" so the customer can ask
   *  for them. */
  addons: PDFAddon[];

  /** Quote-level discounts (applied to the grand total). */
  discounts: QuoteDiscount[];

  /** Customer-facing notes (Mass Save / financing). */
  notes: string | null;
  /** Top-of-quote scope summary. */
  work_order_description: string | null;

  /** Engine results — useful if the renderer needs to spot-check totals. */
  engine_result: PricingResult;
  grand_total: GrandTotalResult;
}

/** Format an ISO timestamp as e.g. "April 28, 2026". */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Fallback variant label when the quote doesn't supply one. */
const VARIANT_LABEL_FALLBACK: Record<SelectedVariant, string> = {
  good: 'Good',
  better: 'Better',
  best: 'Best',
};

/** Map a DB line into the PDF row shape (just the fields the renderer needs). */
function toPDFLine(priced: PricedLine, source: QuoteLineItem): PDFLine {
  return {
    id: source.id,
    description: source.description,
    details: source.details,
    quantity: source.quantity,
    unit_price_cents: priced.unit_price_cents,
    line_total_price_cents: priced.line_total_price_cents,
  };
}

/**
 * Compose the PDF document model.
 *
 * Pre-conditions:
 *  - `lines` is the FULL line set (all variants and all addons).
 *  - `addons` and `discounts` are the company-scoped rows for this quote.
 *  - `pricing` is the effective settings (snapshot if frozen, else live).
 */
export function composeQuoteForPDF(args: {
  company: Company;
  quote: Quote;
  lines: QuoteLineItem[];
  addons: QuoteAddon[];
  discounts: QuoteDiscount[];
  pricing: PricingSettings;
}): PDFDocumentModel {
  const { company, quote, lines, addons, discounts, pricing } = args;

  // Run the engine — gives us per-line + per-variant + per-addon totals.
  const result = priceQuote(
    lines.map((l) => ({
      line_type: l.line_type,
      description: l.description,
      quantity: Number(l.quantity),
      unit_cost_cents: l.unit_cost_cents,
      variant: l.variant,
      addon_id: l.addon_id,
    })),
    pricing,
  );

  // Pair priced lines back with their source rows (same index — priceQuote
  // preserves order). This is the cleanest way to map ids without doing
  // a second pass through priceLine.
  const pricedLineBySourceId = new Map<string, PricedLine>();
  result.lines.forEach((priced, i) => {
    pricedLineBySourceId.set(lines[i].id, priced);
  });

  // ---- Default selected variant: customer's pick, else 'better' ----
  const selected: SelectedVariant = quote.selected_variant ?? 'better';

  // Grand total (selected option + selected addons - discounts)
  const grand = computeGrandTotal({
    result,
    selected_variant: selected,
    selected_addon_ids: addons.filter((a) => a.selected).map((a) => a.id),
    discount_amount_cents: discounts.reduce((s, d) => s + d.amount_cents, 0),
  });

  // ---- Group lines by variant / addon ----
  const optionLines: Record<SelectedVariant, QuoteLineItem[]> = {
    good: [],
    better: [],
    best: [],
  };
  const sharedLines: QuoteLineItem[] = [];
  const addonLinesByAddonId: Record<string, QuoteLineItem[]> = {};

  for (const l of lines) {
    if (l.addon_id) {
      (addonLinesByAddonId[l.addon_id] ??= []).push(l);
      continue;
    }
    if (l.variant === 'all') {
      sharedLines.push(l);
      continue;
    }
    optionLines[l.variant as SelectedVariant].push(l);
  }

  // ---- Build PDFOption rows for each variant that has any lines ----
  const labels = (quote.option_labels ?? {}) as Partial<Record<SelectedVariant, string>>;
  const sharedPDFLines: PDFLine[] = sharedLines.map((src) =>
    toPDFLine(pricedLineBySourceId.get(src.id)!, src),
  );

  const orderedVariants: SelectedVariant[] = ['good', 'better', 'best'];
  const options: PDFOption[] = orderedVariants
    .filter((v) => optionLines[v].length > 0)
    .map((v) => {
      const variantLines = optionLines[v].map((src) =>
        toPDFLine(pricedLineBySourceId.get(src.id)!, src),
      );
      const cost_total_cents = result.variants[v].cost_total_cents;
      const price_total_cents = result.variants[v].price_total_cents;
      return {
        variant: v,
        label: labels[v]?.trim() || VARIANT_LABEL_FALLBACK[v],
        is_selected: v === selected,
        lines: variantLines,
        shared_lines: sharedPDFLines,
        cost_total_cents,
        price_total_cents,
      };
    });

  // If a quote has ONLY shared lines (no per-variant lines), surface them
  // as a single synthetic "all" option using the 'better' totals — gives
  // the renderer something to draw without forcing the user to pick a
  // variant for a single-option quote.
  if (options.length === 0 && sharedPDFLines.length > 0) {
    options.push({
      variant: 'better',
      label: labels.better?.trim() || 'Quote',
      is_selected: true,
      lines: [],
      shared_lines: sharedPDFLines,
      cost_total_cents: result.variants.better.cost_total_cents,
      price_total_cents: result.variants.better.price_total_cents,
    });
  }

  // ---- Build PDFAddon rows ----
  const sortedAddons = [...addons].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  const pdfAddons: PDFAddon[] = sortedAddons.map((a) => {
    const lineRows = (addonLinesByAddonId[a.id] ?? []).map((src) =>
      toPDFLine(pricedLineBySourceId.get(src.id)!, src),
    );
    const total_cents = result.addons[a.id]?.price_total_cents ?? 0;
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      is_selected: a.selected,
      lines: lineRows,
      total_cents,
    };
  });

  return {
    company,
    quote,
    module_label: MODULE_LABELS[quote.module],
    created_date: fmtDate(quote.created_at),
    quote_number: quote.id.slice(0, 8).toUpperCase(),
    selected_variant: selected,
    options,
    shared_lines: sharedPDFLines,
    addons: pdfAddons,
    discounts: [...discounts].sort(
      (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
    ),
    notes: quote.notes,
    work_order_description: quote.work_order_description,
    engine_result: result,
    grand_total: grand,
  };
}

/** Used by the renderer for variant chips that have no per-quote label. */
export { VARIANT_LABEL_FALLBACK };

// Re-export the variant order so the renderer can iterate consistently.
export const VARIANT_ORDER: ReadonlyArray<Variant> = ['good', 'better', 'best', 'all'];
