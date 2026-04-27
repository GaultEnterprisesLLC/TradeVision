import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * TradeVision Button.
 *
 * Variants:
 * - primary  — Safety Green on carbon, the brand action ("Build Quote", "Submit PO")
 * - secondary — Bordered/ghost, alternative actions
 * - danger   — Red, destructive actions (rare)
 * - ghost    — Text-only, low-emphasis (cancel, back)
 *
 * Sizes are phone-first — minimum 44pt tap target on every variant.
 */
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--color-green)] text-[var(--color-carbon)] font-semibold ' +
    'hover:brightness-110 active:brightness-95 ' +
    'shadow-[var(--shadow-glow)] disabled:opacity-50 disabled:shadow-none',
  secondary:
    'bg-transparent text-[var(--color-text)] border border-[var(--color-border)] ' +
    'hover:border-[var(--color-green)] hover:text-[var(--color-green)] ' +
    'active:bg-[var(--color-surface)] disabled:opacity-50',
  danger:
    'bg-[var(--color-danger)] text-white font-semibold ' +
    'hover:brightness-110 active:brightness-95 disabled:opacity-50',
  ghost:
    'bg-transparent text-[var(--color-muted)] ' +
    'hover:text-[var(--color-text)] disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-10 px-4 text-sm rounded-[var(--radius-sm)]',
  md: 'h-12 px-5 text-base rounded-[var(--radius-md)]',
  lg: 'h-14 px-6 text-lg rounded-[var(--radius-lg)]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leftIcon,
  rightIcon,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2',
        'transition-all duration-150 select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-carbon)]',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
    </button>
  );
}
