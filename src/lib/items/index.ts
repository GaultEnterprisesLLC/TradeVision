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
 * IDF-weighted token-overlap match used by the narration flow. Tokens
 * that are rare across the catalog (brand names like "Ecoer", model
 * numbers like "EODA19H-4860ABA") contribute heavily to the score;
 * common tokens ("5", "ton", "inch") barely move the needle.
 *
 * Why this matters: a query "Ecoer 5-ton heat pump" should NOT match
 * "Trane 5 Ton Condenser" even though both share "5 ton" — the brand
 * mismatch is the dominant signal. Plain token overlap (the previous
 * implementation) gave them similar scores, leading to wrong matches
 * like Samsung/Rheem/Navien selected when the user said "Ecoer".
 *
 * Optional `preferLineType` filters candidates first — a query for a
 * material shouldn't match a labor item even if words overlap.
 */
export interface CatalogMatch {
  item: Item;
  score: number;       // 0..1, IDF-weighted match fraction
  matchedTokens: number;
  totalTokens: number;
}

/**
 * Tokenize for matching. Two key behaviors that the naive
 * `split-on-non-alphanumeric` approach gets wrong:
 *
 * 1. Fractions ("3/8", "1/4") are captured as compound tokens BEFORE
 *    the alphanumeric split. Otherwise "3/8 line set" loses the size
 *    info entirely (the slash becomes a space, then "3" and "8" are
 *    filtered out as < 2 chars), so all line-set sizes look identical
 *    to the matcher. Caused the "asked for 3/8, got garbage disposal"
 *    bug. The catalog stores sizes verbatim ("Line Set 1/4 x 1/2 Inch")
 *    so haystack.includes('1/4') works once the token is preserved.
 *
 * 2. Standalone numbers ≥2 chars (BTU sizes, model #s) survive the
 *    >=2 filter. Single-digit numbers ("3", "5") are still filtered —
 *    they're too noisy to be useful as ranking signal on their own.
 */
function tokenize(s: string): string[] {
  const lower = s.toLowerCase();
  const tokens: string[] = [];

  // Capture compound size tokens (e.g. "3/8", "1/4", "20/40"). These
  // must come out BEFORE the alphanumeric split nukes the slash.
  for (const m of lower.matchAll(/\d+\/\d+/g)) {
    tokens.push(m[0]);
  }

  // Standard tokenization on the rest.
  const cleaned = lower.replace(/[^a-z0-9]+/g, ' ');
  for (const t of cleaned.split(/\s+/)) {
    if (t.length >= 2) tokens.push(t);
  }

  return tokens;
}

/**
 * Document frequency map: how many indexed items contain each token.
 * Computed on demand inside findBestCatalogMatches; cached against the
 * input array reference (memoized by useSearchableItems upstream, so
 * stable across renders within a session).
 */
const DF_CACHE = new WeakMap<SearchableItem[], Map<string, number>>();

function getDFMap(indexed: SearchableItem[]): Map<string, number> {
  const cached = DF_CACHE.get(indexed);
  if (cached) return cached;
  const df = new Map<string, number>();
  for (const s of indexed) {
    const seen = new Set(tokenize(s.haystack));
    for (const t of seen) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  DF_CACHE.set(indexed, df);
  return df;
}

export function findBestCatalogMatches(
  query: string,
  indexed: SearchableItem[],
  options: {
    preferLineType?: LineType;
    limit?: number;        // top-N to return; default 5
    minScore?: number;     // discard below this; default 0.4
  } = {},
): CatalogMatch[] {
  const { preferLineType, limit = 5, minScore = 0.4 } = options;
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const candidates = preferLineType
    ? indexed.filter((s) => s.raw.line_type === preferLineType)
    : indexed;
  if (candidates.length === 0) return [];

  // IDF over the FULL catalog (not the line-type-filtered subset) — a
  // brand name's rarity is a property of the whole catalog, not the
  // material/labor partition.
  const df = getDFMap(indexed);
  const totalDocs = indexed.length;

  // Pre-compute IDF for each query token. Higher IDF = rarer = more
  // discriminative. Smoothing constant prevents div-by-zero / log(0).
  const idfPerToken: number[] = tokens.map((t) => {
    const docCount = df.get(t) ?? 0;
    return Math.log((totalDocs + 1) / (docCount + 1)) + 1;
  });
  const totalIDF = idfPerToken.reduce((a, b) => a + b, 0);
  if (totalIDF === 0) return [];

  const scored: CatalogMatch[] = [];
  for (const s of candidates) {
    let weighted = 0;
    let matched = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (s.haystack.includes(tokens[i])) {
        weighted += idfPerToken[i];
        matched++;
      }
    }
    if (matched === 0) continue;
    const score = weighted / totalIDF;
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
