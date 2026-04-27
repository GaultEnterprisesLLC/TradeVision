/**
 * Formatters for money, percent, and quantity values.
 * Use throughout the app for consistent display — never call
 * Intl.NumberFormat directly in components.
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_WHOLE = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const PCT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

/** $1,234.56 — for line items and totals. */
export function money(cents: number): string {
  return USD.format(cents / 100);
}

/** $1,235 — for hero totals where decimals add noise. */
export function moneyWhole(cents: number): string {
  return USD_WHOLE.format(cents / 100);
}

/** 6.25% — given a fractional value (0.0625 → 6.25%). */
export function percent(fraction: number): string {
  return PCT.format(fraction);
}

/** Parse a user-typed dollar amount into integer cents. */
export function parseMoney(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Parse a user-typed percent into fraction. "6.25" → 0.0625 */
export function parsePercent(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}
