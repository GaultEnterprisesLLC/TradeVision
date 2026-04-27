/**
 * TradeVision pricing engine — types.
 *
 * Conventions:
 * - All money is integer CENTS (never floats). $225.00 = 22500.
 * - All percentages are FRACTIONS (0.5 = 50%, 2.0 = 200%).
 * - "Markup" is added on top of cost: cost × (1 + rate). 100% markup = 2× cost.
 * - "Margin" is the share of price that's profit: price × (1 - rate) = cost.
 *   So 40% margin means cost = price × 0.60, or price = cost / 0.60.
 *
 * The engine is module-agnostic — works for HVAC, plumbing, electrical,
 * anything. Trade-specific logic lives in the input forms, not here.
 */

export type LineType =
  | 'material'   // tier-based markup applies
  | 'labor'      // pass-through (rate is already customer-facing in flat-rate)
  | 'overhead'   // pass-through
  | 'permit'     // pass-through
  | 'sub'        // tier-based markup applies (overridable per-line)
  | 'addon';     // tier-based markup applies (UV, humidifier, duct cleaning, etc.)

/** GBB variant. 'all' = the line appears in every variant (e.g. labor, permits). */
export type Variant = 'good' | 'better' | 'best' | 'all';

export type PricingMode = 'markup' | 'margin';

/** Whether the supplier feed is pre-tax (Webb) or post-tax (already includes). */
export type CostBasis = 'pre_tax' | 'post_tax';

/**
 * One bracket in a tiered pricing config.
 * - max_cost_cents = null means "no upper bound" — must be the LAST tier.
 * - rate = fraction (1.0 = 100%, 0.67 = 67%, 2.0 = 200%).
 */
export interface PricingTier {
  max_cost_cents: number | null;
  rate: number;
}

export interface PricingSettings {
  pricing_mode: PricingMode;
  /** Used when the relevant tier array is empty (single-rate mode). */
  default_markup: number;
  default_margin: number;
  /** When non-empty, used in markup mode. Sorted ascending by max_cost_cents. */
  markup_tiers: PricingTier[];
  /** When non-empty, used in margin mode. Sorted ascending by max_cost_cents. */
  margin_tiers: PricingTier[];
  state_tax_rate: number;
  cost_basis: CostBasis;
}

/**
 * One row entered into the quote. Units are kept as integers so we never
 * accumulate floating-point error across 30+ line items.
 */
export interface QuoteLine {
  line_type: LineType;
  description: string;
  quantity: number;          // can be fractional (e.g. hours, linear feet)
  unit_cost_cents: number;   // pre-tax for materials; final $ for labor/overhead/permits
  variant: Variant;
  /**
   * Optional per-line override of the markup/margin rate.
   * - For materials/subs/addons, bypasses tier lookup when set.
   * - 0 = no markup (sometimes used on subs).
   */
  rate_override?: number | null;
  /** Optional flag forcing this line to skip markup entirely (cost = price). */
  pass_through?: boolean;
}

export interface PricedLine extends QuoteLine {
  /** Cost per unit including tax (when pre_tax basis); equals unit_cost_cents otherwise. */
  unit_cost_with_tax_cents: number;
  /** Customer-facing price per unit (post-markup or post-margin). */
  unit_price_cents: number;
  /** Quantity × unit_cost_with_tax. */
  line_total_cost_cents: number;
  /** Quantity × unit_price. */
  line_total_price_cents: number;
  /** The rate actually applied (from tier, override, or default). null for pass-through. */
  applied_rate: number | null;
}

export interface VariantTotal {
  cost_total_cents: number;
  price_total_cents: number;
  /** Profit in cents. price - cost. */
  margin_cents: number;
  /** Profit as a share of price. 0.4 = 40% gross margin. */
  margin_fraction: number;
}

export interface PricingResult {
  lines: PricedLine[];
  variants: {
    good: VariantTotal;
    better: VariantTotal;
    best: VariantTotal;
  };
}
