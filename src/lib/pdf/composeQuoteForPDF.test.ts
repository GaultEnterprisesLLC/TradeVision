/**
 * composeQuoteForPDF — unit tests.
 *
 * The renderer is hard to unit-test (it's a custom render tree). The
 * shaping is where bugs hide, so that's where the contract lives.
 */

import { describe, it, expect } from 'vitest';
import { composeQuoteForPDF, MODULE_LABELS } from './composeQuoteForPDF';
import type {
  Company,
  Quote,
  QuoteAddon,
  QuoteDiscount,
  QuoteLineItem,
} from '@/types/database';
import type { PricingSettings } from '@/lib/pricing/types';

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const pricing: PricingSettings = {
  pricing_mode: 'markup',
  default_markup: 0.5,
  default_margin: 0.4,
  markup_tiers: [],
  margin_tiers: [],
  state_tax_rate: 0.0625,
  cost_basis: 'pre_tax',
};

const company: Company = {
  id: 'company-1',
  tenant_id: 'tenant-1',
  name: 'Gault Enterprises',
  legal_name: 'Gault Enterprises, LLC',
  address_line1: '11 Jan Sebastian Drive STE 13',
  address_line2: null,
  city: 'Sandwich',
  state: 'MA',
  postal_code: '02563',
  phone: '508-648-7321',
  email: 'nick@gaultenterprisesllc.com',
  license_number: null,
  logo_url: null,
  brand_color_primary: null,
  brand_color_accent: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const baseQuote: Quote = {
  id: '00112233-4455-6677-8899-aabbccddeeff',
  tenant_id: 'tenant-1',
  company_id: 'company-1',
  fp_job_id: null,
  fp_quote_id: null,
  customer_name: 'Lovett',
  customer_address: '123 Main St, Sandwich, MA',
  module: 'hvac',
  status: 'in_progress',
  work_order_description: 'Remove existing system, install new heat pump.',
  notes: 'Mass Save rebate matches vendor offer.',
  option_labels: {},
  video_path: null,
  video_uploaded_at: null,
  pricing_snapshot: null,
  subtotal_cents: 0,
  total_cents: 0,
  selected_variant: null,
  created_by: null,
  created_at: '2026-04-28T15:00:00Z',
  updated_at: '2026-04-28T15:00:00Z',
};

function line(overrides: Partial<QuoteLineItem>): QuoteLineItem {
  return {
    id: overrides.id ?? `line-${Math.random().toString(36).slice(2, 8)}`,
    quote_id: baseQuote.id,
    variant: 'all',
    addon_id: null,
    item_id: null,
    description: 'unnamed',
    details: null,
    quantity: 1,
    unit_cost_cents: 10000,
    unit_price_cents: 0,
    line_type: 'material',
    position: 0,
    created_at: '2026-04-28T15:00:00Z',
    ...overrides,
  };
}

function addon(overrides: Partial<QuoteAddon>): QuoteAddon {
  return {
    id: overrides.id ?? `addon-${Math.random().toString(36).slice(2, 8)}`,
    quote_id: baseQuote.id,
    name: 'unnamed addon',
    description: null,
    position: 0,
    selected: false,
    total_cents: 0,
    created_at: '2026-04-28T15:00:00Z',
    updated_at: '2026-04-28T15:00:00Z',
    ...overrides,
  };
}

function discount(overrides: Partial<QuoteDiscount>): QuoteDiscount {
  return {
    id: overrides.id ?? `disc-${Math.random().toString(36).slice(2, 8)}`,
    quote_id: baseQuote.id,
    label: 'Discount',
    amount_cents: 0,
    position: 0,
    created_at: '2026-04-28T15:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------

describe('composeQuoteForPDF — basic shape', () => {
  it('returns module label, formatted date, and 8-char quote number', () => {
    const doc = composeQuoteForPDF({
      company,
      quote: baseQuote,
      lines: [line({ description: 'Filter cabinet', unit_cost_cents: 10000 })],
      addons: [],
      discounts: [],
      pricing,
    });

    expect(doc.module_label).toBe(MODULE_LABELS.hvac);
    expect(doc.quote_number).toBe('00112233');
    expect(doc.created_date).toMatch(/April.*2026/);
  });

  it('defaults selected_variant to "better" when none is set', () => {
    const doc = composeQuoteForPDF({
      company,
      quote: baseQuote,
      lines: [line({ variant: 'all' })],
      addons: [],
      discounts: [],
      pricing,
    });
    expect(doc.selected_variant).toBe('better');
  });

  it('respects a customer-selected variant', () => {
    const doc = composeQuoteForPDF({
      company,
      quote: { ...baseQuote, selected_variant: 'good' },
      lines: [line({ variant: 'good' })],
      addons: [],
      discounts: [],
      pricing,
    });
    expect(doc.selected_variant).toBe('good');
    expect(doc.options.find((o) => o.is_selected)?.variant).toBe('good');
  });
});

// ---------------------------------------------------------------------

describe('composeQuoteForPDF — option grouping', () => {
  it('only includes variants that have lines', () => {
    const doc = composeQuoteForPDF({
      company,
      quote: baseQuote,
      lines: [
        line({ id: 'a', variant: 'good', description: 'Good unit' }),
        line({ id: 'b', variant: 'best', description: 'Best unit' }),
      ],
      addons: [],
      discounts: [],
      pricing,
    });
    expect(doc.options.map((o) => o.variant)).toEqual(['good', 'best']);
  });

  it("uses the per-quote option label when set, else capitalized fallback", () => {
    const doc = composeQuoteForPDF({
      company,
      quote: {
        ...baseQuote,
        option_labels: { good: 'Ecoer 5T HP' },
      },
      lines: [
        line({ variant: 'good' }),
        line({ variant: 'better' }),
      ],
      addons: [],
      discounts: [],
      pricing,
    });
    const good = doc.options.find((o) => o.variant === 'good')!;
    const better = doc.options.find((o) => o.variant === 'better')!;
    expect(good.label).toBe('Ecoer 5T HP');
    expect(better.label).toBe('Better');
  });

  it("synthesizes a single 'better' option when only shared lines exist", () => {
    const doc = composeQuoteForPDF({
      company,
      quote: baseQuote,
      lines: [
        line({ variant: 'all', description: 'Filter cabinet' }),
        line({ variant: 'all', description: 'Labor', line_type: 'labor', unit_cost_cents: 60000 }),
      ],
      addons: [],
      discounts: [],
      pricing,
    });
    expect(doc.options).toHaveLength(1);
    expect(doc.options[0].variant).toBe('better');
    expect(doc.options[0].is_selected).toBe(true);
  });
});

// ---------------------------------------------------------------------

describe('composeQuoteForPDF — addon and discount handling', () => {
  it('separates addon lines from option lines', () => {
    const uvAddonId = 'uv-addon';
    const doc = composeQuoteForPDF({
      company,
      quote: baseQuote,
      lines: [
        line({ id: 'main', variant: 'better', description: 'Main system' }),
        line({
          id: 'uv-bulb',
          variant: 'all', // ignored when addon_id is set
          addon_id: uvAddonId,
          description: 'UV bulb',
          unit_cost_cents: 8000,
        }),
        line({
          id: 'uv-labor',
          variant: 'all',
          addon_id: uvAddonId,
          description: 'UV labor',
          line_type: 'labor',
          unit_cost_cents: 12000,
        }),
      ],
      addons: [addon({ id: uvAddonId, name: 'UV Light Install', selected: true })],
      discounts: [],
      pricing,
    });

    // Option doesn't include addon lines.
    const better = doc.options.find((o) => o.variant === 'better')!;
    expect(better.lines.map((l) => l.id)).toEqual(['main']);

    // Addon bucket has both addon lines.
    expect(doc.addons).toHaveLength(1);
    expect(doc.addons[0].name).toBe('UV Light Install');
    expect(doc.addons[0].is_selected).toBe(true);
    expect(doc.addons[0].lines.map((l) => l.id)).toEqual(['uv-bulb', 'uv-labor']);
    // UV bulb $80 + 6.25% tax = $85, ×1.5 markup = $127.50
    // UV labor $120 pass-through = $120
    // Total ≈ $247.50
    expect(doc.addons[0].total_cents).toBeGreaterThan(0);
  });

  it('keeps unselected addons in the model so the PDF can list them as available', () => {
    const doc = composeQuoteForPDF({
      company,
      quote: baseQuote,
      lines: [line({ variant: 'better' })],
      addons: [
        addon({ id: 'a', name: 'UV Light', selected: false }),
        addon({ id: 'b', name: 'Humidifier', selected: true }),
      ],
      discounts: [],
      pricing,
    });
    expect(doc.addons.map((a) => ({ name: a.name, sel: a.is_selected }))).toEqual([
      { name: 'UV Light', sel: false },
      { name: 'Humidifier', sel: true },
    ]);
  });

  it('does not include unselected addons in the grand total', () => {
    const doc = composeQuoteForPDF({
      company,
      quote: baseQuote,
      lines: [
        line({ id: 'm', variant: 'all', description: 'Main' }),
        line({ id: 'u', variant: 'all', addon_id: 'a-uv', description: 'UV', unit_cost_cents: 8000 }),
      ],
      addons: [addon({ id: 'a-uv', name: 'UV', selected: false })],
      discounts: [],
      pricing,
    });
    // Grand total should equal the option's better total only — addon excluded.
    expect(doc.grand_total.addons_price_cents).toBe(0);
  });

  it('subtracts discounts from the grand total', () => {
    const doc = composeQuoteForPDF({
      company,
      quote: baseQuote,
      lines: [
        line({
          variant: 'all',
          description: 'Main',
          unit_cost_cents: 100000, // $1000 → tax → $1062.50 → ×1.5 = $1593.75
        }),
      ],
      addons: [],
      discounts: [discount({ label: 'Mass Save', amount_cents: 50000 })],
      pricing,
    });
    expect(doc.grand_total.discount_cents).toBe(50000);
    expect(doc.grand_total.grand_total_cents).toBe(
      doc.grand_total.options_price_cents - 50000,
    );
  });

  it('sorts addons and discounts by position then created_at', () => {
    const doc = composeQuoteForPDF({
      company,
      quote: baseQuote,
      lines: [],
      addons: [
        addon({ id: 'a', name: 'A', position: 2, created_at: '2026-04-28T10:00:00Z' }),
        addon({ id: 'b', name: 'B', position: 1, created_at: '2026-04-28T10:00:00Z' }),
        addon({ id: 'c', name: 'C', position: 1, created_at: '2026-04-28T11:00:00Z' }),
      ],
      discounts: [
        discount({ id: 'd1', label: 'Second', position: 2 }),
        discount({ id: 'd2', label: 'First', position: 1 }),
      ],
      pricing,
    });
    expect(doc.addons.map((a) => a.name)).toEqual(['B', 'C', 'A']);
    expect(doc.discounts.map((d) => d.label)).toEqual(['First', 'Second']);
  });
});

// ---------------------------------------------------------------------

describe('composeQuoteForPDF — line shape', () => {
  it('exposes details body for spec-rich lines', () => {
    const doc = composeQuoteForPDF({
      company,
      quote: baseQuote,
      lines: [
        line({
          id: 'spec-line',
          variant: 'better',
          description: '32 HVAC | Navien NHB-150H',
          details:
            'High-efficiency condensing combi boiler\n95% AFUE\nAHRI #210234\n10-year heat exchanger warranty',
        }),
      ],
      addons: [],
      discounts: [],
      pricing,
    });
    const better = doc.options.find((o) => o.variant === 'better')!;
    expect(better.lines[0].details).toContain('AHRI #210234');
  });
});
