/**
 * Catalog item helpers — pure functions, fully testable.
 *
 *  - cleanItemDescription(): strips FieldPulse's leading "NN Category | "
 *    prefix from item descriptions for customer-facing display. The full
 *    description stays on the catalog row for FP round-trip.
 *
 *  - matchesQuery(): the search predicate used by the ItemPicker. Splits
 *    the query into whitespace-separated tokens; every token must appear
 *    (case-insensitive, substring) in at least one of the searchable
 *    fields.
 *
 *  - rankItem(): sort score so exact / startsWith matches surface above
 *    contains-only matches.
 */

import type { Item, LineType } from '@/types/database';

// ---------------------------------------------------------------------
// cleanItemDescription
// ---------------------------------------------------------------------

/**
 * Strip the leading "NN Category Name | " prefix that FP exports prepend.
 * Examples:
 *   "32 HVAC Materials | Navien NHB-150H"  → "Navien NHB-150H"
 *   "1 Plumbing | 1/2\" Copper Tee"        → '1/2" Copper Tee'
 *   "HVAC Labor"                            → "HVAC Labor"  (no prefix; passthrough)
 *   "Whole Home Humidifier"                 → "Whole Home Humidifier"
 *
 * Conservative regex: digits + space + words/spaces, ending in " | ".
 * Doesn't match a literal pipe in the middle of a description.
 */
export function cleanItemDescription(description: string): string {
  return description.replace(/^\d+\s[\w\s&-]+\s\|\s/, '').trim();
}

// ---------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------

/**
 * Lowercase every searchable field once so matchesQuery doesn't lowercase
 * the same haystack on every keystroke.
 */
interface SearchableItem {
  raw: Item;
  haystack: string;
  cleanDescriptionLower: string;
}

export function indexItem(item: Item): SearchableItem {
  const parts = [
    item.description,
    item.details ?? '',
    item.category ?? '',
    item.webb_part_number ?? '',
  ];
  const cleanDesc = cleanItemDescription(item.description);
  return {
    raw: item,
    haystack: parts.join('  ').toLowerCase(),
    cleanDescriptionLower: cleanDesc.toLowerCase(),
  };
}

/**
 * AND-style multi-token search. The user can type "navien 150" and we'll
 * match an item that contains both "navien" AND "150" anywhere in its
 * fields. Empty query matches everything.
 */
export function matchesQuery(s: SearchableItem, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const tokens = trimmed.split(/\s+/);
  for (const t of tokens) {
    if (!s.haystack.includes(t)) return false;
  }
  return true;
}

/**
 * Higher score = better match. Used to sort filter results.
 *  - Exact match on cleaned description: 1000
 *  - Cleaned description starts with query: 500
 *  - Description contains query: 100
 *  - Otherwise: 0 (still passes filter via matchesQuery, just lower)
 */
export function rankItem(s: SearchableItem, query: string): number {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return 0;
  if (s.cleanDescriptionLower === trimmed) return 1000;
  if (s.cleanDescriptionLower.startsWith(trimmed)) return 500;
  if (s.cleanDescriptionLower.includes(trimmed)) return 100;
  return 0;
}

/**
 * Filter + sort an indexed list against a search query and an optional
 * line-type filter.
 */
export function searchItems(
  indexed: SearchableItem[],
  query: string,
  typeFilter: LineType | 'all',
): Item[] {
  const filtered = indexed.filter((s) => {
    if (typeFilter !== 'all' && s.raw.line_type !== typeFilter) return false;
    return matchesQuery(s, query);
  });
  if (!query.trim()) {
    // No query — keep insertion order (already sorted by description in DB).
    return filtered.map((s) => s.raw);
  }
  return filtered
    .map((s) => ({ s, score: rankItem(s, query) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break alphabetical by clean description for stable UI.
      return a.s.cleanDescriptionLower.localeCompare(b.s.cleanDescriptionLower);
    })
    .map(({ s }) => s.raw);
}

export type { SearchableItem };

// ---------------------------------------------------------------------
// AI-fuzzy match — for narration → catalog mapping
// ---------------------------------------------------------------------

/**
 * Permissive token-overlap match used by the narration flow. Unlike
 * matchesQuery (AND semantics: every token must appear), this scores
 * each candidate by how many query tokens overlap and returns the top
 * results regardless of whether all tokens hit.
 *
 * Why a separate function: Gemini's output ("Ecoer 5-ton heat pump")
 * may not exactly match the catalog ("32 HVAC Materials | Ecoer
 * Condenser 4-5 Ton 454B") on every token. Best partial match >
 * no match.
 *
 * Optional `preferLineType` filters candidates first — a query for a
 * material shouldn't match a labor item even if the words happen to
 * overlap.
 */
export interface CatalogMatch {
  item: Item;
  score: number;       // 0..1, fraction of query tokens that hit haystack
  matchedTokens: number;
  totalTokens: number;
}

export function findBestCatalogMatches(
  query: string,
  indexed: SearchableItem[],
  options: {
    preferLineType?: LineType;
    limit?: number;        // top-N to return; default 5
    minScore?: number;     // discard below this; default 0.25
  } = {},
): CatalogMatch[] {
  const { preferLineType, limit = 5, minScore = 0.25 } = options;
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];

  const candidates = preferLineType
    ? indexed.filter((s) => s.raw.line_type === preferLineType)
    : indexed;

  const scored: CatalogMatch[] = [];
  for (const s of candidates) {
    let matched = 0;
    for (const t of tokens) {
      if (s.haystack.includes(t)) matched++;
    }
    if (matched === 0) continue;
    const score = matched / tokens.length;
    if (score < minScore) continue;
    scored.push({
      item: s.raw,
      score,
      matchedTokens: matched,
      totalTokens: tokens.length,
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-break: prefer shorter (more specific) descriptions
    return a.item.description.length - b.item.description.length;
  });

  return scored.slice(0, limit);
}
