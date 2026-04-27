import { Aperture } from './Aperture';

/**
 * TradeVision wordmark + aperture lockup.
 * "Trade" bold white + "Vision" regular green, Barlow Condensed uppercase.
 *
 * Layout variants:
 * - 'horizontal' — mark left, wordmark right (header, default)
 * - 'stacked' — mark on top, wordmark below (splash, hero)
 * - 'mark-only' — just the aperture (favicon, app icon contexts)
 */
interface LogoProps {
  variant?: 'horizontal' | 'stacked' | 'mark-only';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { mark: 24, text: 'text-lg' },
  md: { mark: 36, text: 'text-2xl' },
  lg: { mark: 56, text: 'text-4xl' },
};

export function Logo({
  variant = 'horizontal',
  size = 'md',
  className = '',
}: LogoProps) {
  const s = SIZES[size];

  if (variant === 'mark-only') {
    return <Aperture size={s.mark} className={className} />;
  }

  const wordmark = (
    <span
      className={`${s.text} uppercase tracking-wider leading-none`}
      style={{ fontFamily: 'var(--font-display)' }}
    >
      <span className="font-bold text-[var(--color-text)]">Trade</span>
      <span className="font-normal text-[var(--color-green)]">Vision</span>
    </span>
  );

  if (variant === 'stacked') {
    return (
      <div className={`flex flex-col items-center gap-3 ${className}`}>
        <Aperture size={s.mark} />
        {wordmark}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Aperture size={s.mark} />
      {wordmark}
    </div>
  );
}
