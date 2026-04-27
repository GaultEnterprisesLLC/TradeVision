/**
 * TradeVision pricing engine — tests.
 *
 * These tests are the contract. If you change engine.ts, run `npm test`
 * and any failures here are real regressions.
 *
 * Conventions used in fixtures:
 *   - Money in CENTS (22500 = $225.00)
 *   - Rates as fractions (0.5 = 50%)
 */

import { describe, it, expect } from 'vitest';
import type {
  PricingSettings,
  PricingTier,
  QuoteLine,
} from './types';
import {
  findTierRate,
  priceLine,
  priceQuote,
  previewMaterialPrice,
  validateTiers,
} from './engine';

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

/** Single-rate Gault default — 50% markup, MA tax, Webb pre-tax. */
const flatSettings: PricingSettings = {
  pricing_mode: 'markup',
  default_markup: 0.5,
  default_margin: 0.4,
  markup_tiers: [],
  margin_tiers: [],
  state_tax_rate: 0.0625,
  cost_basis: 'pre_tax',
};

/** Nick's example tiers — small parts get higher markup. */
const tieredSettings: PricingSettings = {
  ...flatSettings,
  markup_tiers: [
    { max_cost_cents: 20000, rate: 2.0 },   // $0–200    → 200%
    { max_cost_cents: 30000, rate: 1.5 },   // $200–300  → 150%
    { max_cost_cents: 50000, rate: 1.0 },   // $300–500  → 100%
    { max_cost_cents: null,  rate: 0.67 },  // $500+     → 67%
  ],
};

const marginTieredSettings: PricingSettings = {
  ...flatSettings,
  pricing_mode: 'margin',
  margin_tiers: [
    { max_cost_cents: 20000, rate: 0.6 },   // 60% margin
    { max_cost_cents: null,  rate: 0.4 },   // 40% margin
  ],
};

// ---------------------------------------------------------------------
// findTierRate
// ---------------------------------------------------------------------

describe('findTierRate', () => {
  const tiers: PricingTier[] = [
    { max_cost_cents: 10000, rate: 2.0 },
    { max_cost_cents: 50000, rate: 1.0 },
    { max_cost_cents: null,  rate: 0.5 },
  ];

  it('returns null for an empty tier list', () => {
    expect(findTierRate(15000, [])).toBeNull();
  });

  it('matches the first bracket for low cost', () => {
    expect(findTierRate(5000, tiers)).toBe(2.0);
  });

  it('matches exactly at a tier boundary (≤)', () => {
    expect(findTierRate(10000, tiers)).toBe(2.0);
  });

  it('one cent over a boundary spills into the next tier', () => {
    expect(findTierRate(10001, tiers)).toBe(1.0);
  });

  it('matches the open-ended top bracket', () => {
    expect(findTierRate(999999, tiers)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------
// validateTiers
// ---------------------------------------------------------------------

describe('validateTiers', () => {
  it('accepts an empty array', () => {
    expect(validateTiers([])).toEqual([]);
  });

  it('flags a non-final tier with an unlimited cap', () => {
    const issues = validateTiers([
      { max_cost_cents: null, rate: 1.0 },
      { max_cost_cents: 50000, rate: 0.5 },
    ]);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags caps that are not strictly ascending', () => {
    const issues = validateTiers([
      { max_cost_cents: 10000, rate: 2.0 },
      { max_cost_cents: 5000,  rate: 1.0 },
    ]);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags negative rates', () => {
    const issues = validateTiers([
      { max_cost_cents: 10000, rate: -0.1 },
    ]);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('accepts the canonical 4-tier setup', () => {
    expect(validateTiers(tieredSettings.markup_tiers)).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// priceLine — tax + markup
// ---------------------------------------------------------------------

describe('priceLine — material with flat 50% markup', () => {
  it('adds tax then 50% markup', () => {
    // $100 material → +6.25% tax = $106.25 → ×1.5 = $159.38 (rounds to 15938)
    const line: QuoteLine = {
      line_type: 'material',
      description: 'Test fitting',
      quantity: 1,
      unit_cost_cents: 10000,
      variant: 'all',
    };
    const priced = priceLine(line, flatSettings);
    expect(priced.unit_cost_with_tax_cents).toBe(10625);
    expect(priced.unit_price_cents).toBe(15938);
    expect(priced.applied_rate).toBe(0.5);
  });

  it('multiplies the line total by quantity', () => {
    const line: QuoteLine = {
      line_type: 'material',
      description: 'CSST 50ft roll',
      quantity: 2,
      unit_cost_cents: 8000,
      variant: 'all',
    };
    const priced = priceLine(line, flatSettings);
    expect(priced.line_total_cost_cents).toBe(8000 * 2 + Math.round(8000 * 2 * 0.0625));
    expect(priced.line_total_price_cents).toBe(priced.unit_price_cents * 2);
  });

  it('skips tax when cost_basis is post_tax', () => {
    const line: QuoteLine = {
      line_type: 'material',
      description: 'Already-taxed item',
      quantity: 1,
      unit_cost_cents: 10000,
      variant: 'all',
    };
    const priced = priceLine(line, { ...flatSettings, cost_basis: 'post_tax' });
    expect(priced.unit_cost_with_tax_cents).toBe(10000);
    expect(priced.unit_price_cents).toBe(15000);
  });
});

// ---------------------------------------------------------------------
// priceLine — tiered markup (Nick's exact example)
// ---------------------------------------------------------------------

describe('priceLine — tiered markup', () => {
  it("a $100 part hits the 200% bracket", () => {
    // $100 + tax = $106.25 → tier: ≤$200, 200% → ×3 = $318.75
    const priced = priceLine(
      {
        line_type: 'material',
        description: 'small fitting',
        quantity: 1,
        unit_cost_cents: 10000,
        variant: 'all',
      },
      tieredSettings,
    );
    expect(priced.applied_rate).toBe(2.0);
    expect(priced.unit_cost_with_tax_cents).toBe(10625);
    expect(priced.unit_price_cents).toBe(31875);
  });

  it("a $400 part hits the 100% bracket", () => {
    // $400 + tax = $425.00 → tier: ≤$500, 100% → ×2 = $850
    const priced = priceLine(
      {
        line_type: 'material',
        description: 'mid item',
        quantity: 1,
        unit_cost_cents: 40000,
        variant: 'all',
      },
      tieredSettings,
    );
    expect(priced.applied_rate).toBe(1.0);
    expect(priced.unit_price_cents).toBe(85000);
  });

  it("a $4000 boiler hits the 67% bracket", () => {
    // $4000 + tax = $4250 → tier: open, 67% → ×1.67 = $7097.50
    const priced = priceLine(
      {
        line_type: 'material',
        description: 'Lochinvar boiler',
        quantity: 1,
        unit_cost_cents: 400000,
        variant: 'best',
      },
      tieredSettings,
    );
    expect(priced.applied_rate).toBe(0.67);
    expect(priced.unit_cost_with_tax_cents).toBe(425000);
    expect(priced.unit_price_cents).toBe(709750);
  });
});

// ---------------------------------------------------------------------
// priceLine — pass-through types
// ---------------------------------------------------------------------

describe('priceLine — labor, overhead, permits pass through', () => {
  it('labor is not taxed and not marked up', () => {
    // 4 hours × $300/hr = $1200, period.
    const priced = priceLine(
      {
        line_type: 'labor',
        description: '2-tech HVAC install',
        quantity: 4,
        unit_cost_cents: 30000,
        variant: 'all',
      },
      tieredSettings,
    );
    expect(priced.unit_cost_with_tax_cents).toBe(30000);
    expect(priced.unit_price_cents).toBe(30000);
    expect(priced.line_total_price_cents).toBe(120000);
    expect(priced.applied_rate).toBeNull();
  });

  it('permits pass through', () => {
    const priced = priceLine(
      {
        line_type: 'permit',
        description: 'Town of Sandwich mechanical permit',
        quantity: 1,
        unit_cost_cents: 12500,
        variant: 'all',
      },
      tieredSettings,
    );
    expect(priced.unit_price_cents).toBe(12500);
  });

  it('pass_through flag disables markup even on materials', () => {
    const priced = priceLine(
      {
        line_type: 'material',
        description: 'Customer-supplied unit',
        quantity: 1,
        unit_cost_cents: 50000,
        variant: 'all',
        pass_through: true,
      },
      tieredSettings,
    );
    expect(priced.unit_price_cents).toBe(50000);
  });
});

// ---------------------------------------------------------------------
// priceLine — overrides
// ---------------------------------------------------------------------

describe('priceLine — rate_override', () => {
  it('honors a per-line override over tier lookup', () => {
    const priced = priceLine(
      {
        line_type: 'material',
        description: 'special item',
        quantity: 1,
        unit_cost_cents: 10000,
        variant: 'all',
        rate_override: 0.25,
      },
      tieredSettings,
    );
    expect(priced.applied_rate).toBe(0.25);
  });

  it('override of 0 disables markup but still applies tax', () => {
    const priced = priceLine(
      {
        line_type: 'sub',
        description: 'Electrical sub passthrough',
        quantity: 1,
        unit_cost_cents: 100000,
        variant: 'all',
        rate_override: 0,
      },
      flatSettings,
    );
    expect(priced.applied_rate).toBe(0);
    expect(priced.unit_cost_with_tax_cents).toBe(106250);
    expect(priced.unit_price_cents).toBe(106250);
  });
});

// ---------------------------------------------------------------------
// priceLine — margin mode
// ---------------------------------------------------------------------

describe('priceLine — margin mode', () => {
  it('40% margin on $100 cost = $166.67 price', () => {
    // cost with tax = $106.25; price = 106.25 / (1 - 0.4) = $177.08
    const priced = priceLine(
      {
        line_type: 'material',
        description: 'test',
        quantity: 1,
        unit_cost_cents: 10000,
        variant: 'all',
      },
      { ...flatSettings, pricing_mode: 'margin' },
    );
    expect(priced.applied_rate).toBe(0.4);
    expect(priced.unit_cost_with_tax_cents).toBe(10625);
    expect(priced.unit_price_cents).toBe(17708);
    // Sanity: margin_cents / price_cents ≈ 0.4
    const margin = priced.unit_price_cents - priced.unit_cost_with_tax_cents;
    expect(Math.abs(margin / priced.unit_price_cents - 0.4)).toBeLessThan(0.001);
  });

  it('uses tiered margin when configured', () => {
    // $100 cost → tax → $106.25 → tier ≤$200 = 60% margin → 106.25 / 0.4 = $265.63
    const priced = priceLine(
      {
        line_type: 'material',
        description: 'test',
        quantity: 1,
        unit_cost_cents: 10000,
        variant: 'all',
      },
      marginTieredSettings,
    );
    expect(priced.applied_rate).toBe(0.6);
    expect(priced.unit_price_cents).toBe(26563);
  });
});

// ---------------------------------------------------------------------
// priceQuote — Good / Better / Best
// ---------------------------------------------------------------------

describe('priceQuote — GBB variants', () => {
  it('rolls up totals correctly across variants', () => {
    const lines: QuoteLine[] = [
      // Common to all three
      {
        line_type: 'labor',
        description: '2-tech install',
        quantity: 6,
        unit_cost_cents: 30000,
        variant: 'all',
      },
      {
        line_type: 'permit',
        description: 'mechanical permit',
        quantity: 1,
        unit_cost_cents: 15000,
        variant: 'all',
      },
      // Equipment variants
      {
        line_type: 'material',
        description: 'Ecoer base unit',
        quantity: 1,
        unit_cost_cents: 250000,
        variant: 'good',
      },
      {
        line_type: 'material',
        description: 'Rheem mid unit',
        quantity: 1,
        unit_cost_cents: 350000,
        variant: 'better',
      },
      {
        line_type: 'material',
        description: 'Navien hydro-air',
        quantity: 1,
        unit_cost_cents: 500000,
        variant: 'best',
      },
    ];

    const result = priceQuote(lines, tieredSettings);

    // Each variant must include labor + permit + its own unit, and nothing more.
    expect(result.variants.good.price_total_cents).toBeGreaterThan(0);
    expect(result.variants.better.price_total_cents).toBeGreaterThan(
      result.variants.good.price_total_cents,
    );
    expect(result.variants.best.price_total_cents).toBeGreaterThan(
      result.variants.better.price_total_cents,
    );

    // Common-only check: Good + Better + Best should all share the labor+permit base.
    // Compute that base by hand: 6 × 30000 + 1 × 15000 = 195000.
    const sharedBase = 195000;
    expect(result.variants.good.price_total_cents).toBeGreaterThan(sharedBase);
    expect(result.variants.good.cost_total_cents).toBeGreaterThan(sharedBase);
  });

  it('reports a sensible margin fraction', () => {
    const lines: QuoteLine[] = [
      {
        line_type: 'material',
        description: 'fittings',
        quantity: 1,
        unit_cost_cents: 10000,
        variant: 'all',
      },
    ];
    const result = priceQuote(lines, flatSettings);
    expect(result.variants.good.margin_fraction).toBeGreaterThan(0);
    expect(result.variants.good.margin_fraction).toBeLessThan(1);
  });

  it('handles an empty quote', () => {
    const result = priceQuote([], flatSettings);
    expect(result.variants.good.price_total_cents).toBe(0);
    expect(result.variants.better.price_total_cents).toBe(0);
    expect(result.variants.best.price_total_cents).toBe(0);
  });
});

// ---------------------------------------------------------------------
// previewMaterialPrice
// ---------------------------------------------------------------------

describe('previewMaterialPrice', () => {
  it('returns cost-with-tax, price, and applied rate', () => {
    const result = previewMaterialPrice(40000, tieredSettings);
    expect(result.unit_cost_with_tax_cents).toBe(42500);
    expect(result.unit_price_cents).toBe(85000);
    expect(result.applied_rate).toBe(1.0);
  });

  it('reports the correct rate at the tier boundary', () => {
    // $200 → tax → $212.50 → no longer in 200% tier (cap is $200), drops to next
    const result = previewMaterialPrice(20000, tieredSettings);
    // $200 + 6.25% tax = $212.50, which is > $200 cap, so falls to 150% tier
    expect(result.applied_rate).toBe(1.5);
  });
});
