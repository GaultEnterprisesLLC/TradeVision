import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/**
 * Native <select> styled to match the TradeVision input system.
 * Native is intentional — iOS/Android selects are excellent on phones,
 * better than any custom dropdown for a field tool.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, children, id, ...props },
  ref,
) {
  const selectId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-xs uppercase tracking-wider text-[var(--color-muted)]"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex items-center h-12 px-3',
          'bg-[var(--color-carbon)] border rounded-[var(--radius-md)]',
          'transition-colors duration-150 focus-within:border-[var(--color-green)]',
          error
            ? 'border-[var(--color-danger)]'
            : 'border-[var(--color-border)]',
        )}
      >
        <select
          {...props}
          ref={ref}
          id={selectId}
          className={cn(
            'flex-1 bg-transparent outline-none text-[var(--color-text)] appearance-none',
            'pr-6 cursor-pointer',
            className,
          )}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'><path d='M1 1L6 6L11 1' stroke='%237D8590' stroke-width='2' stroke-linecap='round'/></svg>\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 4px center',
          }}
        >
          {children}
        </select>
      </div>
      {error ? (
        <p className="text-xs text-[var(--color-danger)]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[var(--color-muted)]">{hint}</p>
      ) : null}
    </div>
  );
});
