import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { cleanItemDescription, searchItems } from '@/lib/items';
import { useSearchableItems } from '@/lib/queries/items';
import type { Item, LineType } from '@/types/database';

/**
 * ItemPicker — full-screen catalog picker with FieldPulse-style Quick Add.
 *
 * Two modes, no extra UI to switch:
 *   - Tap one item → it goes into the selection tray (badge appears).
 *   - Tap more items → they accumulate.
 *   - Bottom bar shows "Add N items" → on tap, all selected items are
 *     emitted at once via onPickMany() and the picker closes.
 *   - Tap an already-selected item → de-selects.
 *   - "+ Custom line" pinned at the top is a separate single-shot path
 *     for items not in the catalog.
 *
 * Every selected catalog item later inserts as a line at qty=1 with
 * variant='all' (or scoped to the addon when applicable). Per-line
 * tweaks (quantity, variant, description) happen on the line cards
 * after Quick Add — same place you edit any other line.
 */

export type ItemPickResult =
  | { kind: 'items'; items: Item[] }
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
  const [selected, setSelected] = useState<Map<string, Item>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state on open/close so re-opening starts fresh.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setTypeFilter('all');
      setSelected(new Map());
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

  function toggleItem(item: Item) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, item);
      }
      return next;
    });
  }

  function commitSelection() {
    if (selected.size === 0) return;
    // Preserve original picking order — ES Maps are insertion-ordered.
    onPick({ kind: 'items', items: Array.from(selected.values()) });
  }

  if (!open) return null;

  const selectedCount = selected.size;
  const trayLabel =
    selectedCount === 0
      ? 'Tap items to add'
      : `Add ${selectedCount} item${selectedCount === 1 ? '' : 's'}`;

  return (
    <div
      className="fixed inset-0 z-40 bg-[var(--color-carbon)] flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Pick catalog items"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <h2
          className="text-base uppercase tracking-wider"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Add Lines
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

      {/* Custom line pinned (single-shot path — bypasses tray) */}
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
      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ paddingBottom: selectedCount > 0 ? '5rem' : '0' }}
      >
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
                selected={selected.has(it.id)}
                onToggle={() => toggleItem(it)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Bottom action bar — Quick Add. Only renders when there's something
          to add, so search results aren't covered when the tray is empty. */}
      {selectedCount > 0 && (
        <div
          className="absolute left-0 right-0 bottom-0 px-4 py-3 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex items-center gap-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Map())}
          >
            Clear
          </Button>
          <Button
            size="md"
            fullWidth
            onClick={commitSelection}
          >
            {trayLabel}
          </Button>
        </div>
      )}

      {/* Footer count — replaced by action bar when selection is active */}
      {!isLoading && !error && selectedCount === 0 && (
        <div
          className="px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
        >
          <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
            {results.length.toLocaleString()} of {indexed?.length.toLocaleString() ?? 0} items
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// One row in the result list — selectable.
// ---------------------------------------------------------------------
function ResultRow({
  item,
  selected,
  onToggle,
}: {
  item: Item;
  selected: boolean;
  onToggle: () => void;
}) {
  const cleaned = cleanItemDescription(item.description);
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className={cn(
          'w-full flex items-start gap-3 px-4 py-3 text-left',
          'border-b border-[var(--color-border)] transition-colors',
          selected
            ? 'bg-[var(--color-green)]/10'
            : 'hover:bg-[var(--color-surface)] active:bg-[var(--color-surface)]',
        )}
      >
        {/* Checkbox-style affordance — fills with brand green when selected. */}
        <div
          className={cn(
            'flex-shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
            selected
              ? 'border-[var(--color-green)] bg-[var(--color-green)] text-[var(--color-carbon)]'
              : 'border-[var(--color-border)] bg-transparent',
          )}
          aria-hidden
        >
          {selected && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium truncate', selected ? 'text-[var(--color-text)]' : 'text-[var(--color-text)]')}>
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
