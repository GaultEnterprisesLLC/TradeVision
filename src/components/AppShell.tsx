import type * as React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Logo } from './Logo';
import { useCompany } from '@/lib/queries/company';
import { cn } from '@/lib/cn';

/**
 * App shell: top header (logo + tenant name placeholder) + content + bottom nav.
 *
 * Phone-first layout. Bottom nav is the primary navigation; never use
 * a sidebar on the small viewport. Header is intentionally compact —
 * the tech is in a basement, not an office.
 */

type NavItem = {
  to: string;
  label: string;
  icon: () => React.ReactElement;
  primary?: boolean;
};

const NAV: NavItem[] = [
  { to: '/quotes', label: 'Quotes', icon: QuotesIcon },
  { to: '/new', label: 'New', icon: PlusIcon, primary: true },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/more', label: 'More', icon: MoreIcon },
];

export function AppShell() {
  const { data: company } = useCompany();
  return (
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto">
      {/* Top header */}
      <header
        className={cn(
          'sticky top-0 z-10',
          'flex items-center justify-between',
          'h-14 px-4',
          'bg-[var(--color-carbon)] border-b border-[var(--color-border)]',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <Logo size="sm" />
        <span className="text-xs text-[var(--color-muted)] uppercase tracking-wider truncate">
          {company?.name ?? ' '}
        </span>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav
        className={cn(
          'fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md',
          'h-20 grid grid-cols-4',
          'bg-[var(--color-surface)] border-t border-[var(--color-border)]',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV.map(({ to, label, icon: Icon, primary }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-1',
                'transition-colors duration-150',
                isActive
                  ? 'text-[var(--color-green)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-text)]',
              )
            }
          >
            {primary ? (
              <span
                className={cn(
                  'flex items-center justify-center',
                  'w-12 h-12 rounded-full',
                  'bg-[var(--color-green)] text-[var(--color-carbon)]',
                  'shadow-[var(--shadow-glow)]',
                )}
              >
                <Icon />
              </span>
            ) : (
              <Icon />
            )}
            <span className="text-[10px] uppercase tracking-wider font-semibold">
              {label}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/* ============================================================
   Bottom-nav icons (inline SVG to keep deps minimal)
   ============================================================ */
function QuotesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}
