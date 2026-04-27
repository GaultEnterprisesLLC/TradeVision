import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * TradeVision Card — surface container.
 * Used for grouping settings, quote line items, equipment options, etc.
 *
 * `interactive` adds hover/press affordances for tappable cards (like
 * GBB option selection).
 */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  selected?: boolean;
  children?: ReactNode;
}

export function Card({
  interactive = false,
  selected = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      {...props}
      className={cn(
        'bg-[var(--color-surface)] border rounded-[var(--radius-lg)] p-4',
        'transition-all duration-150',
        selected
          ? 'border-[var(--color-green)] shadow-[var(--shadow-glow)]'
          : 'border-[var(--color-border)]',
        interactive &&
          'cursor-pointer hover:border-[var(--color-green)] active:scale-[0.99]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mb-3 pb-3 border-b border-[var(--color-border)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3
      className={cn('text-base uppercase tracking-wider', className)}
      style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
    >
      {children}
    </h3>
  );
}
