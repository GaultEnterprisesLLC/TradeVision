/**
 * TradeVision aperture / crosshair mark.
 * The brand logomark — used in app headers, splash screens, proposal footers.
 *
 * Spec (TradeVision Brand Spec v1):
 * - Outer ring: green
 * - Crosshair lines: border color
 * - Cardinal tick marks: green
 * - Center dot: green
 *
 * Colorways:
 * - 'default' — full color on dark surfaces (most common)
 * - 'mono-green' — green-only (for tight branding moments)
 * - 'mono-white' — white-only (for inverse / on-print contexts)
 * - 'mono-dark' — carbon-only (for light backgrounds)
 */
type Colorway = 'default' | 'mono-green' | 'mono-white' | 'mono-dark';

interface ApertureProps {
  size?: number | string;
  colorway?: Colorway;
  className?: string;
  title?: string;
}

const PALETTE: Record<
  Colorway,
  { ring: string; cross: string; tick: string; dot: string }
> = {
  default: {
    ring: 'var(--color-green)',
    cross: 'var(--color-border)',
    tick: 'var(--color-green)',
    dot: 'var(--color-green)',
  },
  'mono-green': {
    ring: 'var(--color-green)',
    cross: 'var(--color-green)',
    tick: 'var(--color-green)',
    dot: 'var(--color-green)',
  },
  'mono-white': {
    ring: 'var(--color-text)',
    cross: 'var(--color-text)',
    tick: 'var(--color-text)',
    dot: 'var(--color-text)',
  },
  'mono-dark': {
    ring: 'var(--color-carbon)',
    cross: 'var(--color-carbon)',
    tick: 'var(--color-carbon)',
    dot: 'var(--color-carbon)',
  },
};

export function Aperture({
  size = 40,
  colorway = 'default',
  className,
  title = 'TradeVision',
}: ApertureProps) {
  const c = PALETTE[colorway];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      <circle cx="32" cy="32" r="26" stroke={c.ring} strokeWidth="3" />
      {/* Crosshair lines */}
      <line x1="32" y1="2" x2="32" y2="22" stroke={c.cross} strokeWidth="2" />
      <line x1="32" y1="42" x2="32" y2="62" stroke={c.cross} strokeWidth="2" />
      <line x1="2" y1="32" x2="22" y2="32" stroke={c.cross} strokeWidth="2" />
      <line x1="42" y1="32" x2="62" y2="32" stroke={c.cross} strokeWidth="2" />
      {/* Cardinal ticks */}
      <line x1="32" y1="6" x2="32" y2="14" stroke={c.tick} strokeWidth="3" strokeLinecap="round" />
      <line x1="32" y1="50" x2="32" y2="58" stroke={c.tick} strokeWidth="3" strokeLinecap="round" />
      <line x1="6" y1="32" x2="14" y2="32" stroke={c.tick} strokeWidth="3" strokeLinecap="round" />
      <line x1="50" y1="32" x2="58" y2="32" stroke={c.tick} strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="32" r="4" fill={c.dot} />
    </svg>
  );
}
