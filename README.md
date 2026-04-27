# TradeVision

> Field pricing intelligence for mechanical contractors.
> Point your camera at the job, walk back to the customer with a signed quote.

[tradevision.us](https://tradevision.us)

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 |
| Styling | Tailwind v4 (CSS-first config via `@theme`) |
| Routing | react-router-dom v7 |
| Server state | TanStack Query v5 |
| UI state | Zustand |
| Offline cache | Dexie (IndexedDB) |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) |
| PWA | vite-plugin-pwa with Workbox |

## Project layout

```
tradevision/
├── public/
│   ├── favicon.svg              # aperture mark, brand-correct
│   └── icons/                   # PWA icons (see "PWA icons" below)
├── src/
│   ├── components/
│   │   ├── ui/                  # primitives: Button, Card, Input, Toggle, Select, MoneyInput, PercentInput
│   │   ├── Aperture.tsx         # logo mark
│   │   ├── Logo.tsx             # mark + wordmark lockups
│   │   └── AppShell.tsx         # phone-first shell with bottom nav
│   ├── lib/
│   │   ├── cn.ts                # classname helper
│   │   ├── format.ts            # money/percent formatters and parsers
│   │   ├── supabase.ts          # singleton Supabase client (publishable key)
│   │   └── db.ts                # Dexie offline cache
│   ├── routes/
│   │   ├── Quotes.tsx
│   │   ├── New.tsx              # module picker
│   │   └── Settings.tsx         # the foundation: labor, tax, markup/margin, etc.
│   ├── types/database.ts        # Supabase types (regenerate after migrations)
│   ├── App.tsx                  # router
│   ├── main.tsx                 # QueryClient + service worker registration
│   ├── index.css                # brand design tokens + base styles
│   └── vite-env.d.ts
├── supabase/
│   └── migrations/
│       ├── 0001_initial_schema.sql   # multi-tenant schema with RLS
│       └── 0002_seed_gault.sql       # Gault Enterprises seed data
├── .env.local                   # gitignored — local dev secrets
├── .env.example                 # template for new contributors
├── vite.config.ts               # Vite + Tailwind + PWA + @ alias
└── tsconfig.app.json            # @/* path alias
```

## Brand tokens

Defined once in `src/index.css` via Tailwind v4's `@theme`. **Never hardcode hex values in components.**

| Token | Value | Use |
|---|---|---|
| `--color-green` | `#7FE621` | Safety Green — primary accent, CTAs |
| `--color-carbon` | `#0D1117` | Primary background |
| `--color-surface` | `#161B22` | Card surface |
| `--color-navy` | `#0F2640` | Alternate dark surface |
| `--color-border` | `#2A3444` | Borders, dividers |
| `--color-text` | `#E6EDF3` | Primary text |
| `--color-muted` | `#7D8590` | Secondary text |
| `--font-display` | Barlow Condensed | Headings |
| `--font-sans` | Barlow | Body |
| `--font-mono` | IBM Plex Mono | All numeric/data |

## Setup

```bash
npm install
cp .env.example .env.local        # then fill in real Supabase values
npm run dev                       # http://localhost:5173
```

The dev server binds to `0.0.0.0` so you can open it on your phone via the LAN
IP that Vite prints. That's how to test PWA install on a real device.

## Supabase setup

The app expects a Supabase project with the multi-tenant schema applied.

1. Create the project (already done: `tradevision`, region `us-east-1`).
2. Go to **SQL Editor → New query**.
3. Paste `supabase/migrations/0001_initial_schema.sql`, run it.
4. Paste `supabase/migrations/0002_seed_gault.sql`, run it.
5. Regenerate TypeScript types:

```bash
npx supabase gen types typescript --project-id fwnffkfxpsezzpscmhpb > src/types/database.ts
```

(Or use the Supabase CLI with `supabase db push` if you've initialized it
locally.)

## Environment variables

`.env.local` (never commit — it's gitignored via `*.local`):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxx
VITE_APP_NAME=TradeVision
VITE_APP_DOMAIN=tradevision.us
```

The **publishable key** (formerly "anon key") is safe in the browser — RLS
policies keep tenant data isolated. The **secret key** lives only in
Supabase Edge Function secrets, never in this repo.

## PWA icons (TODO)

`public/icons/` currently lacks the PNG icons referenced by the manifest.
Generate them from `public/favicon.svg`:

- `icon-192.png` — 192×192
- `icon-512.png` — 512×512
- `icon-512-maskable.png` — 512×512 with safe area
- `apple-touch-icon.png` — 180×180

Quickest path: drop `favicon.svg` into [realfavicongenerator.net](https://realfavicongenerator.net),
download the PNG bundle, drop into `public/icons/`. Until that's done the
PWA installs but uses a fallback icon on the home screen.

## Build phases (per product spec)

| Phase | Modules |
|---|---|
| **Phase 1** | HVAC changeouts · Generator installs · Water heaters · Boilers |
| Phase 2 | Plumbing flat-rate service · New construction per fixture |
| Phase 3 | Manual J · Manual D · IAQ add-ons |
| Phase 4 | Water treatment |

## Scripts

```bash
npm run dev        # dev server with HMR
npm run build      # tsc -b && vite build
npm run preview    # serve dist/ for production smoke test
npm run lint       # ESLint
```

## License

UNLICENSED — proprietary to Gault Ventures, LLC (pending entity formation).
