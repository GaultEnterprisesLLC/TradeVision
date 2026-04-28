/**
 * TradeVision pricing engine.
 *
 * Pure functions only — no I/O, no React, no Supabase. Trivially testable.
 * Every line item flows through the same pipeline; trade-specific behavior
 * is composed by the caller, not branched here.
 *
 * Pipeline (per material/sub/addon line):
 *   unit_cost (pre-tax)
 *     → + state tax (if cost_basis is pre_tax)
 *     → cost_basis (the "true cost")
 *     → look up applicable tier rate (or use override / default)
 *     → apply markup or margin
 *     → unit_price (customer-facing)
 *
 * Pipeline (per labor/overhead/permit line OR pass_through line):
 *   unit_cost
 *     → unit_price = unit_cost (no tax, no markup)
 */

import type {
  AddonTotal,
  CostBasis,
  GrandTotalArgs,
  GrandTotalResult,
  PricedLine,
  PricingMode,
  PricingResult,
  PricingSettings,
  PricingTier,
  QuoteLine,
  Variant,
  VariantTotal,
} from './types';

// ---------------------------------------------------------------------
// SMALL HELPERS
// ---------------------------------------------------------------------

/** Round to nearest integer cent. Banker's rounding can drift; standard round. */
function roundCents(n: number): number {
  return Math.round(n);
}

/** Lines that are subject to markup/margin (everything except pass-through types). */
function isMarkable(line: QuoteLine): boolean {
  if (line.pass_through) return false;
  return (
    line.line_type === 'material' ||
    line.line_type === 'sub' ||
    line.line_type === 'addon'
  );
}

// ---------------------------------------------------------------------
// TIER VALIDATION + LOOKUP
// ---------------------------------------------------------------------

/**
 * Walk an ordered tier array and return the rate that applies to a given
 * cost. Tiers must be sorted ascending by max_cost_cents (null at end).
 *
 * Returns null when the array is empty — caller should fall back to
 * the single default rate.
 */
export function findTierRate(
  cost_cents: number,
  tiers: PricingTier[],
): number | null {
  if (tiers.length === 0) return null;

  for (const tier of tiers) {
    if (tier.max_cost_cents === null) {
      // Open-ended top bracket — always matches.
      return tier.rate;
    }
    if (cost_cents <= tier.max_cost_cents) {
      return tier.rate;
    }
  }

  // No tier matched and last tier had a finite cap — use the last tier as
  // a defensive fallback rather than throwing. UI should prevent this.
  return tiers[tiers.length - 1].rate;
}

/**
 * Validate a tier array. Returns array of human-readable issues.
 * Empty array = valid. Used by the settings UI.
 */
export function validateTiers(tiers: PricingTier[]): string[] {
  const issues: string[] = [];
  if (tiers.length === 0) return issues;

  // 1. Rates must be non-negative
  tiers.forEach((t, i) => {
    if (t.rate < 0) {
      issues.push(`Tier ${i + 1} has a negative rate.`);
    }
  });

  // 2. Caps must be ascending; only the last tier may be open-ended.
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const isLast = i === tiers.length - 1;

    if (t.max_cost_cents === null && !isLast) {
      issues.push(
        `Only the last tier can have an unlimited cap (found at row ${i + 1}).`,
      );
    }
    if (t.max_cost_cents !== null && t.max_cost_cents <= 0) {
      issues.push(`Tier ${i + 1} cap must be greater than $0.`);
    }
    if (i > 0) {
      const prev = tiers[i - 1];
      if (
        prev.max_cost_cents !== null &&
        t.max_cost_cents !== null &&
        t.max_cost_cents <= prev.max_cost_cents
      ) {
        issues.push(
          `Tier ${i + 1} cap must be greater than tier ${i}'s cap.`,
        );
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------
// PER-LINE PRICING
// ---------------------------------------------------------------------

/** Add state tax to a pre-tax cost (when applicable). */
function applyTax(unit_cost_cents: number, basis: CostBasis, tax_rate: number): number {
  if (basis === 'post_tax') return unit_cost_cents;
  return roundCents(unit_cost_cents * (1 + tax_rate));
}

/**
 * Apply markup or margin to a cost-with-tax to get the customer price.
 * - Markup: price = cost × (1 + rate)
 * - Margin: price = cost / (1 - rate)   (clamped: rate < 1)
 */
function applyMargin(
  cost_with_tax_cents: number,
  rate: number,
  mode: PricingMode,
): number {
  if (mode === 'markup') {
    return roundCents(cost_with_tax_cents * (1 + rate));
  }
  // margin
  if (rate >= 1) {
    // 100% margin is impossible (price would be infinite). Treat as no markup
    // rather than dividing by zero — UI should prevent this anyway.
    return cost_with_tax_cents;
  }
  return roundCents(cost_with_tax_cents / (1 - rate));
}

/**
 * Determine the rate to apply for a given line.
 * Priority:
 *   1. Per-line override (if set, even to 0)
 *   2. Tier lookup (if tier array is non-empty)
 *   3. Default flat rate from settings
 */
function resolveRate(
  cost_with_tax_cents: number,
  line: QuoteLine,
  settings: PricingSettings,
): number {
  if (line.rate_override !== undefined && line.rate_override !== null) {
    return line.rate_override;
  }

  const tiers =
    settings.pricing_mode === 'markup'
      ? settings.markup_tiers
      : settings.margin_tiers;

  const tierRate = findTierRate(cost_with_tax_cents, tiers);
  if (tierRate !== null) return tierRate;

  return settings.pricing_mode === 'markup'
    ? settings.default_markup
    : settings.default_margin;
}

/** Price a single line in isolation. */
export function priceLine(line: QuoteLine, settings: PricingSettings): PricedLine {
  // Labor / overhead / permits / pass-through: no tax, no markup
  if (!isMarkable(line)) {
    const lineTotal = roundCents(line.unit_cost_cents * line.quantity);
    return {
      ...line,
      unit_cost_with_tax_cents: line.unit_cost_cents,
      unit_price_cents: line.unit_cost_cents,
      line_total_cost_cents: lineTotal,
      line_total_price_cents: lineTotal,
      applied_rate: null,
    };
  }

  // Material / sub / addon: tax + markup/margin
  const unit_cost_with_tax = applyTax(
    line.unit_cost_cents,
    settings.cost_basis,
    settings.state_tax_rate,
  );
  const rate = resolveRate(unit_cost_with_tax, line, settings);
  const unit_price = applyMargin(unit_cost_with_tax, rate, settings.pricing_mode);

  return {
    ...line,
    unit_cost_with_tax_cents: unit_cost_with_tax,
    unit_price_cents: unit_price,
    line_total_cost_cents: roundCents(unit_cost_with_tax * line.quantity),
    line_total_price_cents: roundCents(unit_price * line.quantity),
    applied_rate: rate,
  };
}

// ---------------------------------------------------------------------
// QUOTE-LEVEL TOTALS (GBB)
// ---------------------------------------------------------------------

/**
 * Sum the lines that contribute to a particular Option.
 *
 * Addon lines are EXCLUDED — they're scoped to their Add-on Package and
 * roll up via sumAddons() instead. This is what lets a quote like
 * 3879-Lovett ($39,468 total) show "HVAC Replacement" at $36,393 plus
 * "UV Light Install" at $1,362 plus "Humidifier" at $3,713 separately,
 * rather than baking everything into the option total.
 */
function sumVariant(lines: PricedLine[], v: 'good' | 'better' | 'best'): VariantTotal {
  let cost = 0;
  let price = 0;

  for (const l of lines) {
    if (l.addon_id != null) continue; // addon lines roll up separately
    if (l.variant === v || l.variant === 'all') {
      cost += l.line_total_cost_cents;
      price += l.line_total_price_cents;
    }
  }

  const margin_cents = price - cost;
  const margin_fraction = price > 0 ? margin_cents / price : 0;

  return {
    cost_total_cents: cost,
    price_total_cents: price,
    margin_cents,
    margin_fraction,
  };
}

/**
 * Group lines by addon_id and sum each bucket. Returns {} if no addon
 * lines exist. Caller is responsible for knowing which addons are
 * "Selected" — the engine reports totals for every addon present.
 */
function sumAddons(lines: PricedLine[]): Record<string, AddonTotal> {
  const buckets = new Map<string, { cost: number; price: number }>();
  for (const l of lines) {
    if (l.addon_id == null) continue;
    const cur = buckets.get(l.addon_id) ?? { cost: 0, price: 0 };
    cur.cost += l.line_total_cost_cents;
    cur.price += l.line_total_price_cents;
    buckets.set(l.addon_id, cur);
  }
  const out: Record<string, AddonTotal> = {};
  for (const [id, { cost, price }] of buckets) {
    const margin_cents = price - cost;
    out[id] = {
      cost_total_cents: cost,
      price_total_cents: price,
      margin_cents,
      margin_fraction: price > 0 ? margin_cents / price : 0,
    };
  }
  return out;
}

/**
 * Price an entire quote — all lines, all three GBB variants.
 *
 * Variant lines (good/better/best) are typically equipment swaps; lines
 * with variant='all' apply to every option (labor, permits, ductwork
 * standard inclusions, etc.).
 */
export function priceQuote(
  lines: QuoteLine[],
  settings: PricingSettings,
): PricingResult {
  const priced = lines.map((l) => priceLine(l, settings));
  return {
    lines: priced,
    variants: {
      good: sumVariant(priced, 'good'),
      better: sumVariant(priced, 'better'),
      best: sumVariant(priced, 'best'),
    },
    addons: sumAddons(priced),
  };
}

// ---------------------------------------------------------------------
// GRAND TOTAL (selected option + selected addons − discounts)
// ---------------------------------------------------------------------

/**
 * The customer-facing grand total. Combines:
 *   - the customer's selected Option (one of good/better/best)
 *   - every Add-on Package the customer ticked Selected
 *   - minus the sum of all applied discounts
 *
 * Pure function — selection state and discount totals come in as args,
 * not derived from the lines themselves. The engine doesn't know which
 * addons are selected; that's UI/persistence state.
 */
export function computeGrandTotal(args: GrandTotalArgs): GrandTotalResult {
  const variant = args.result.variants[args.selected_variant];
  const options_price_cents = variant.price_total_cents;
  const options_cost_cents = variant.cost_total_cents;

  let addons_price_cents = 0;
  let addons_cost_cents = 0;
  for (const id of args.selected_addon_ids) {
    const a = args.result.addons[id];
    if (!a) continue; // selected id no longer exists — defensive
    addons_price_cents += a.price_total_cents;
    addons_cost_cents += a.cost_total_cents;
  }

  const discount_cents = Math.max(0, args.discount_amount_cents);
  const grand_total_cents =
    options_price_cents + addons_price_cents - discount_cents;
  const grand_cost_cents = options_cost_cents + addons_cost_cents;
  const margin_cents = grand_total_cents - grand_cost_cents;
  const margin_fraction = grand_total_cents > 0 ? margin_cents / grand_total_cents : 0;

  return {
    options_price_cents,
    addons_price_cents,
    discount_cents,
    grand_total_cents,
    options_cost_cents,
    addons_cost_cents,
    grand_cost_cents,
    margin_cents,
    margin_fraction,
  };
}

// ---------------------------------------------------------------------
// PREVIEW HELPER (for the settings tier editor)
// ---------------------------------------------------------------------

/**
 * Small utility used by the live preview in the settings screen.
 * Given a hypothetical material cost and the current settings, return
 * what the customer would pay along with the rate that was applied.
 */
export function previewMaterialPrice(
  unit_cost_cents: number,
  settings: PricingSettings,
): { unit_cost_with_tax_cents: number; unit_price_cents: number; applied_rate: number } {
  const result = priceLine(
    {
      line_type: 'material',
      description: 'preview',
      quantity: 1,
      unit_cost_cents,
      variant: 'all',
    },
    settings,
  );
  return {
    unit_cost_with_tax_cents: result.unit_cost_with_tax_cents,
    unit_price_cents: result.unit_price_cents,
    applied_rate: result.applied_rate ?? 0,
  };
}

/** Aliases used by the rest of the app. */
export type { Variant };
