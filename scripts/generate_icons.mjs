// =====================================================================
// TradeVision — PWA icon generator
// =====================================================================
// Reads public/favicon.svg (the brand-spec aperture mark) and produces
// the four PNG icon files referenced by the PWA manifest + index.html:
//
//   public/icons/icon-192.png         (192×192, "any"   purpose)
//   public/icons/icon-512.png         (512×512, "any"   purpose)
//   public/icons/icon-512-maskable.png(512×512, "maskable" — Android adaptive)
//   public/icons/apple-touch-icon.png (180×180, iOS home screen)
//
// Path note: apple-touch-icon goes inside public/icons/ to match the
// reference in index.html (<link rel="apple-touch-icon" href="/icons/
// apple-touch-icon.png">). Keeping all four icons under /icons/ also
// matches the workbox precache pattern.
//
// All four are rendered onto a Carbon background (#0D1117) so they look
// consistent across launchers and so the PWA's `background_color`
// matches the icon plate. The SVG's intrinsic 81%-of-viewport sizing
// gives us a comfortable safe zone inside Android's maskable mask.
//
// Usage:
//   npm run gen:icons
//
// Re-run any time the brand mark changes. Outputs are deterministic.
// =====================================================================

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const SVG_PATH = resolve(PROJECT_ROOT, 'public', 'favicon.svg');
const ICONS_DIR = resolve(PROJECT_ROOT, 'public', 'icons');

/** Carbon — matches PWA manifest background_color and the in-app surface. */
const BG = '#0D1117';

const TARGETS = [
  // Standard PWA icons. SVG renders at full canvas; the aperture mark
  // is already inset 19% inside its viewport so the visual padding is
  // automatic.
  { out: resolve(ICONS_DIR, 'icon-192.png'),         size: 192, render: 192 },
  { out: resolve(ICONS_DIR, 'icon-512.png'),         size: 512, render: 512 },
  // Maskable — the OS may clip to a circle/squircle. Render the mark at
  // 80% (safe zone) and pad with the brand background so corner-clipping
  // never reaches the aperture.
  { out: resolve(ICONS_DIR, 'icon-512-maskable.png'), size: 512, render: 410 },
  // iOS apple-touch — Apple rounds corners but doesn't mask aggressively.
  // Lives inside /icons/ to match index.html's <link rel="apple-touch-icon">.
  { out: resolve(ICONS_DIR, 'apple-touch-icon.png'), size: 180, render: 180 },
];

async function main() {
  if (!existsSync(SVG_PATH)) {
    console.error(`No SVG at ${SVG_PATH}. Aborting.`);
    process.exit(1);
  }
  if (!existsSync(ICONS_DIR)) {
    mkdirSync(ICONS_DIR, { recursive: true });
    console.log(`Created ${ICONS_DIR}`);
  }
  const svg = readFileSync(SVG_PATH);

  for (const t of TARGETS) {
    // Render the SVG at the inner (render) size, then composite onto a
    // size×size carbon plate centered. When render === size, this is a
    // no-padding render against the brand background.
    const inner = await sharp(svg, { density: 1024 })
      .resize(t.render, t.render, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const offset = Math.round((t.size - t.render) / 2);
    await sharp({
      create: {
        width: t.size,
        height: t.size,
        channels: 4,
        background: BG,
      },
    })
      .composite([{ input: inner, left: offset, top: offset }])
      .png()
      .toFile(t.out);

    console.log(`  wrote ${relativeFromRoot(t.out)}  (${t.size}×${t.size}, mark @ ${t.render}px)`);
  }

  console.log('\nDone. Re-run `npm run build` and re-deploy to push these to Vercel.');
  console.log('On phone: uninstall the existing PWA + reinstall to refresh the home-screen icon.');
}

function relativeFromRoot(p) {
  return p.replace(PROJECT_ROOT, '').replace(/^[\\/]/, '');
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
