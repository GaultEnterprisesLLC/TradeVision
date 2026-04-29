/**
 * Catalog item helpers — unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  cleanItemDescription,
  indexItem,
  matchesQuery,
  rankItem,
  searchItems,
} from './index';
import type { Item } from '@/types/database';

function item(overrides: Partial<Item>): Item {
  return {
    id: overrides.id ?? `item-${Math.random().toString(36).slice(2, 8)}`,
    tenant_id: 'tenant-1',
    webb_part_number: null,
    fp_item_id: null,
    description: 'untitled',
    details: null,
    category: null,
    uom: 'each',
    unit_cost_cents: 0,
    line_type: 'material',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------

describe('cleanItemDescription', () => {
  it('strips FP "NN Category | " prefix', () => {
    expect(cleanItemDescription('32 HVAC Materials | Navien NHB-150H'))
      .toBe('Navien NHB-150H');
  });

  it('handles multi-word categories', () => {
    expect(cleanItemDescription('1 Plumbing & Gas | Watts FBV-3 Ball Valve'))
      .toBe('Watts FBV-3 Ball Valve');
  });

  it('passes through descriptions with no prefix', () => {
    expect(cleanItemDescription('HVAC Labor')).toBe('HVAC Labor');
    expect(cleanItemDescription('Whole Home Humidifier')).toBe('Whole Home Humidifier');
  });

  it('does not strip an internal pipe', () => {
    expect(cleanItemDescription('Generac 22kW | Air-Cooled')).toBe('Generac 22kW | Air-Cooled');
  });
});

// ---------------------------------------------------------------------

describe('matchesQuery', () => {
  const navien = indexItem(
    item({
      description: '32 HVAC Materials | Navien NHB-150H',
      details: '95% AFUE condensing combi boiler. AHRI #210234.',
      category: 'HVAC',
      webb_part_number: 'NHB-150H',
    }),
  );

  it('matches an empty query (returns all)', () => {
    expect(matchesQuery(navien, '')).toBe(true);
  });

  it('matches a single token case-insensitively', () => {
    expect(matchesQuery(navien, 'navien')).toBe(true);
    expect(matchesQuery(navien, 'NAVIEN')).toBe(true);
  });

  it('AND-matches multiple tokens across fields', () => {
    expect(matchesQuery(navien, 'navien 150')).toBe(true);
    expect(matchesQuery(navien, '150 navien')).toBe(true); // order doesn't matter
    expect(matchesQuery(navien, 'navien afue')).toBe(true); // crosses fields
  });

  it('rejects when any token is absent', () => {
    expect(matchesQuery(navien, 'navien rheem')).toBe(false);
  });

  it('matches Webb part numbers', () => {
    expect(matchesQuery(navien, 'NHB-150H')).toBe(true);
  });
});

// ---------------------------------------------------------------------

describe('rankItem', () => {
  const navien = indexItem(item({ description: '32 HVAC Materials | Navien NHB-150H' }));

  it('exact-cleaned-description match scores highest', () => {
    expect(rankItem(navien, 'Navien NHB-150H')).toBe(1000);
  });

  it('startsWith scores above contains', () => {
    expect(rankItem(navien, 'navien')).toBe(500);
  });

  it('contains-only scores low', () => {
    expect(rankItem(navien, '150h')).toBe(100);
  });

  it('zero score when no match (still 0, filter excludes earlier)', () => {
    expect(rankItem(navien, 'rheem')).toBe(0);
  });
});

// ---------------------------------------------------------------------

describe('searchItems', () => {
  const items = [
    item({ id: 'a', description: '32 HVAC Materials | Navien NHB-150H', line_type: 'material' }),
    item({ id: 'b', description: '32 HVAC Materials | Rheem 96V Furnace', line_type: 'material' }),
    item({ id: 'c', description: 'HVAC Labor', line_type: 'labor' }),
    item({ id: 'd', description: '1 Plumbing | Watts FBV-3 Valve', line_type: 'material' }),
  ];
  const indexed = items.map(indexItem);

  it('returns all items for empty query + all type', () => {
    expect(searchItems(indexed, '', 'all')).toHaveLength(4);
  });

  it('filters by line_type', () => {
    const labor = searchItems(indexed, '', 'labor');
    expect(labor.map((i) => i.id)).toEqual(['c']);
  });

  it('orders matches by score then alpha', () => {
    const result = searchItems(indexed, 'hvac', 'all');
    // Three items contain "hvac" — Navien, Rheem, HVAC Labor.
    // HVAC Labor cleaned = "HVAC Labor" → startsWith → 500
    // Navien NHB-150H, Rheem 96V Furnace cleaned don't startsWith hvac
    // (their cleaned descs start with brand). They contain via category.
    expect(result.length).toBeGreaterThanOrEqual(3);
    // First should be HVAC Labor due to startsWith.
    expect(result[0].description).toBe('HVAC Labor');
  });

  it('excludes items missing a search token', () => {
    const result = searchItems(indexed, 'navien rheem', 'all');
    expect(result).toEqual([]);
  });
});
