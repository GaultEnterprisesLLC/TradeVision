import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { cleanItemDescription, searchItems } from '@/lib/items';
import { useSearchableItems } from '@/lib/queries/items';
import type { Item, LineType } from '@/types/database';

/**
 * ItemPicker — full-screen catalog picker.
 *
 * Behavior:
 *   - Opens when the user taps "+ Add line" in the editor.
 *   - Shows a search bar (auto-focused) at the top, then optional
 *     line-type filter chips, then the result list.
 *   - "Custom line" pinned to the top — same flow as before for items
 *     that aren't in the catalog.
 *   - Tap any result → onPick({ kind: 'item', item }) closes the picker
 *     and the editor pre-fills.
 *   - Tap "Custom line" → onPick({ kind: 'custom' }) opens a blank
 *     LineEditor.
 *
 * No virtualization — we'll add @tanstack/react-virtual when a tenant
 * crosses ~5,000 items. For 879 (Gault) renders fine.
 */

export type ItemPickResult =
  | { kind: 'item'; item: Item; cleanedDescription: string }
  | { kind: 'custom' };

interface ItemPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (result: ItemPickResult) => void;
}

const TYPE_FILTERS: { value: LineType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'material', label: 'Material' },
  { value: 'labor', label: 'Labor' },
  { value: 'permit', label: 'Permit' },
  { value: 'addon', label: 'Add-on' },
  { value: 'sub', label: 'Sub' },
  { value: 'overhead', label: 'Overhead' },
];

const LINE_TYPE_LABEL: Record<LineType, string> = {
  material: 'Material',
  labor: 'Labor',
  overhead: 'Overhead',
  permit: 'Permit',
  sub: 'Sub',
  addon: 'Add-on',
};

export function ItemPicker({ open, onClose, onPick }: ItemPickerProps) {
  const { data: indexed, isLoading, error } = useSearchableItems();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<LineType | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state on close so re-opening starts fresh.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setTypeFilter('all');
    } else {
      // Auto-focus the search input on open. Small delay so the modal
      // mount animation finishes before the keyboard pops on iOS.
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on Escape (desktop ergonomics).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(
    () => (indexed ? searchItems(indexed, query, typeFilter) : []),
    [indexed, query, typeFilter],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-[var(--color-carbon)] flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Pick a catalog item"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <h2
          className="text-base uppercase tracking-wider"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Add Line
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>

      {/* Search + filter */}
      <div className="px-4 py-3 flex flex-col gap-3 border-b border-[var(--color-border)]">
        <Input
          ref={inputRef}
          placeholder="Search catalog (e.g. Navien 150, Pure Pro, Symmons)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          {TYPE_FILTERS.map((t) => {
            const active = typeFilter === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTypeFilter(t.value)}
                className={cn(
                  'flex-shrink-0 px-3 h-8 rounded-full text-xs uppercase tracking-wider font-semibold transition-colors',
                  active
                    ? 'bg-[var(--color-green)] text-[var(--color-carbon)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-text)]',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom line pinned */}
      <button
        type="button"
        onClick={() => onPick({ kind: 'custom' })}
        className={cn(
          'flex items-center justify-between gap-3 px-4 py-3',
          'bg-[var(--color-carbon)] border-b border-[var(--color-border)]',
          'text-left hover:bg-[var(--color-surface)] transition-colors',
        )}
      >
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">
            + Custom line
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            Type the description and price manually
          </p>
        </div>
        <span
          className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Manual
        </span>
      </button>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && (
          <p className="text-sm text-[var(--color-muted)] text-center py-8">
            Loading catalog…
          </p>
        )}
        {error && (
          <p className="text-sm text-[var(--color-danger)] text-center py-8">
            Couldn't load catalog: {error.message}
          </p>
        )}
        {!isLoading && !error && results.length === 0 && (
          <p className="text-sm text-[var(--color-muted)] text-center py-8">
            No items match. Try a different search or pick + Custom line above.
          </p>
        )}
        {!isLoading && !error && results.length > 0 && (
          <ul className="flex flex-col">
            {results.map((it) => (
              <ResultRow
                key={it.id}
                item={it}
                onPick={() =>
                  onPick({
                    kind: 'item',
                    item: it,
                    cleanedDescription: cleanItemDescription(it.description),
                  })
                }
              />
            ))}
          </ul>
        )}
      </div>

      {/* Footer count */}
      {!isLoading && !error && (
        <div className="px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
            {results.length.toLocaleString()} of {indexed?.length.toLocaleString() ?? 0} items
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// One row in the result list.
// ---------------------------------------------------------------------
function ResultRow({ item, onPick }: { item: Item; onPick: () => void }) {
  const cleaned = cleanItemDescription(item.description);
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={cn(
          'w-full flex items-start justify-between gap-3 px-4 py-3 text-left',
          'border-b border-[var(--color-border)]',
          'hover:bg-[var(--color-surface)] active:bg-[var(--color-surface)] transition-colors',
        )}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--color-text)] font-medium truncate">
            {cleaned}
          </p>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5 truncate">
            {item.category ?? '—'}
            {item.webb_part_number && ` · ${item.webb_part_number}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-sm tabular-nums text-[var(--color-text)] [font-family:var(--font-mono)]">
            {money(item.unit_cost_cents)}
          </span>
          <span
            className={cn(
              'text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded',
              'bg-[var(--color-surface)] text-[var(--color-muted)]',
            )}
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            {LINE_TYPE_LABEL[item.line_type]}
          </span>
        </div>
      </button>
    </li>
  );
}
