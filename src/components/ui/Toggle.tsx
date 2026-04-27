import { cn } from '@/lib/cn';

/**
 * Two-position toggle / switch.
 * Used for: in-house vs subbed (generators), markup vs margin (pricing mode),
 * permit required, etc.
 *
 * Renders as a segmented pill so both options are always visible —
 * matters for tactile use on a phone in the field.
 */
interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

interface ToggleProps<T extends string> {
  label?: string;
  hint?: string;
  options: [ToggleOption<T>, ToggleOption<T>];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}

export function Toggle<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  disabled,
}: ToggleProps<T>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span
          className="text-xs uppercase tracking-wider text-[var(--color-muted)]"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          {label}
        </span>
      )}
      <div
        role="radiogroup"
        aria-label={label}
        className={cn(
          'inline-flex p-1 bg-[var(--color-carbon)] border border-[var(--color-border)] rounded-[var(--radius-md)] gap-1',
          disabled && 'opacity-50 pointer-events-none',
        )}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={active}
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={cn(
                'h-10 px-4 rounded-[var(--radius-sm)] text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-[var(--color-green)] text-[var(--color-carbon)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-text)]',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {hint && (
        <p className="text-xs text-[var(--color-muted)]">{hint}</p>
      )}
    </div>
  );
}
