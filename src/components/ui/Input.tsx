import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

/**
 * TradeVision text input.
 *
 * Optional label, hint, error, leading/trailing adornments.
 * Use MoneyInput / PercentInput for currency and percentage values —
 * those format and apply IBM Plex Mono automatically.
 */
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  dataNumeric?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leading, trailing, dataNumeric, className, id, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs uppercase tracking-wider text-[var(--color-muted)]"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex items-center gap-2 h-12 px-3',
          'bg-[var(--color-carbon)] border rounded-[var(--radius-md)]',
          'transition-colors duration-150',
          'focus-within:border-[var(--color-green)]',
          error
            ? 'border-[var(--color-danger)]'
            : 'border-[var(--color-border)]',
        )}
      >
        {leading && (
          <span className="text-[var(--color-muted)] flex-shrink-0">{leading}</span>
        )}
        <input
          {...props}
          ref={ref}
          id={inputId}
          data-numeric={dataNumeric || undefined}
          className={cn(
            'flex-1 bg-transparent outline-none placeholder:text-[var(--color-muted)]',
            'text-[var(--color-text)]',
            dataNumeric &&
              'tabular-nums [font-family:var(--font-mono)]',
            className,
          )}
        />
        {trailing && (
          <span className="text-[var(--color-muted)] flex-shrink-0">{trailing}</span>
        )}
      </div>
      {error ? (
        <p className="text-xs text-[var(--color-danger)]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[var(--color-muted)]">{hint}</p>
      ) : null}
    </div>
  );
});
