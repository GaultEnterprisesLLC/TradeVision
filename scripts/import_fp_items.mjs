// =====================================================================
// TradeVision — FieldPulse items CSV importer
// =====================================================================
// Reads a FieldPulse "Item export sheet" CSV, transforms each row into
// our public.items shape, and bulk-loads them into Supabase.
//
// Strategy: truncate-and-reload. Every run wipes the current tenant's
// items table and inserts the parsed rows. Once we have stable FP item
// IDs in the export we'll switch to upsert; until then this is the
// simplest way to keep the catalog in sync with FP.
//
// Usage (PowerShell):
//   npm run import:fp-items -- "C:\Users\nick\Downloads\Item_export_sheet.csv"
//
// Or directly:
//   node scripts/import_fp_items.mjs path/to/items.csv
//
// Required env vars (read from .env.local at the project root):
//   VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY     ← bypasses RLS; never commit, never paste anywhere
//
// The script also expects a tenant with slug 'gault-enterprises' to
// already exist (see migration 0002_seed_gault.sql).
// =====================================================================

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const TENANT_SLUG = 'gault-enterprises';

// ---------------------------------------------------------------------
// .env.local loader (avoid adding dotenv as a dep for one script)
// ---------------------------------------------------------------------

function loadEnvLocal() {
  const path = resolve(PROJECT_ROOT, '.env.local');
  if (!existsSync(path)) {
    fail(
      `Couldn't find .env.local at ${path}. ` +
        `Copy .env.example to .env.local and fill in your Supabase values.`,
    );
  }
  const text = readFileSync(path, 'utf-8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------
// CSV parser (handles quoted fields with embedded newlines)
// ---------------------------------------------------------------------

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cur);
        cur = '';
      } else if (ch === '\r') {
        // skip — wait for \n
      } else if (ch === '\n') {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------
// Field-mapping helpers
// ---------------------------------------------------------------------

const PREFIX_RE = /^(\d{2})\s+([^|]+?)\s*\|\s*(.+)$/;

/** "32 HVAC Materials | Trion Air Bear" → { code:'32', categoryRaw:'HVAC Materials', itemName:'Trion Air Bear' }. */
function parsePrefix(name) {
  const m = name.match(PREFIX_RE);
  if (!m) return { code: null, categoryRaw: null, itemName: name.trim() };
  return {
    code: m[1],
    categoryRaw: m[2].trim(),
    itemName: m[3].trim(),
  };
}

/** "HVAC Materials" → "hvac_materials" (lowercase, non-alnum → underscore). */
function categorySlug(raw) {
  if (!raw) return null;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** "5180.81" → 518081 ; "" → null. */
function parseDollarsToCents(s) {
  if (s === undefined || s === null) return null;
  const t = String(s).replace(/[$,\s]/g, '').trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * Decide line_type from FP item type + category. Defaults to material
 * for products, labor for services, with category-based refinements.
 */
function classifyLineType(itemType, categoryRaw) {
  if (itemType === 'product') return 'material';
  if (itemType !== 'service') return 'material'; // description-only etc.
  if (!categoryRaw) return 'labor';
  const c = categoryRaw.toLowerCase();
  if (c.includes('plans') && c.includes('permits')) return 'permit';
  if (c.includes('discount')) return 'addon';
  return 'labor';
}

/**
 * Skip rules:
 *  - Old Items archive
 *  - Header rows where the post-pipe name starts with the same NN prefix
 *    as before the pipe (e.g. "31 HVAC | 31 HVAC")
 *  - Services with no cost AND no price (placeholder rows)
 */
function shouldSkip({ itemType, code, categoryRaw, itemName, costCents, priceCents }) {
  if (categoryRaw && categoryRaw.toLowerCase().includes('old items')) {
    return 'old-items archive';
  }
  if (code && itemName.startsWith(`${code} `)) {
    return 'header row (NN prefix repeated)';
  }
  if (itemType === 'service' && costCents == null && priceCents == null) {
    return 'service with no cost or price';
  }
  if (itemType === 'product' && costCents == null) {
    return 'product with no unit cost';
  }
  if (itemType === 'description-only') {
    return 'description-only row';
  }
  return null;
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

async function main() {
  loadEnvLocal();

  const csvArg = process.argv[2];
  if (!csvArg) {
    fail(
      'Missing CSV path argument.\n' +
        'Usage: npm run import:fp-items -- "C:\\path\\to\\Item_export_sheet.csv"',
    );
  }
  const csvPath = resolve(csvArg);
  if (!existsSync(csvPath)) {
    fail(`CSV not found at ${csvPath}`);
  }

  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) fail('Missing VITE_SUPABASE_URL in .env.local');
  if (!serviceKey) {
    fail(
      'Missing SUPABASE_SERVICE_ROLE_KEY in .env.local.\n' +
        'Grab the secret key from Supabase → Project Settings → API Keys → Secret keys.',
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Resolve tenant ---
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('slug', TENANT_SLUG)
    .single();
  if (tenantErr || !tenant) {
    fail(
      `Couldn't resolve tenant "${TENANT_SLUG}". Run migration 0002_seed_gault.sql first.\n` +
        (tenantErr?.message ?? ''),
    );
  }
  log(`Tenant: ${tenant.name} (${tenant.id})`);

  // --- Parse CSV ---
  const text = readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(text);
  if (rows.length === 0) fail('CSV is empty.');
  const header = rows[0].map((h) => h.trim());
  const expected = [
    'Invoice Item Name',
    'Item #/SKU',
    'Item Type',
    'Unit Cost',
    'Unit Price',
    'Quantity',
    'Taxed',
    'Description',
  ];
  for (const col of expected) {
    if (!header.includes(col)) {
      fail(`CSV is missing expected column "${col}". Got: ${header.join(', ')}`);
    }
  }
  const idx = (name) => header.indexOf(name);
  const data = rows.slice(1).filter((r) => r.length === header.length && r[idx('Invoice Item Name')]);
  log(`Parsed ${data.length} rows from ${csvPath}`);

  // --- Transform ---
  const items = [];
  const skipped = { 'old-items archive': 0, 'header row (NN prefix repeated)': 0, 'service with no cost or price': 0, 'product with no unit cost': 0, 'description-only row': 0 };
  const seenSku = new Map(); // sku → first row's full name (for dedup warnings)
  const skuCollisions = [];

  for (const r of data) {
    const fullName = r[idx('Invoice Item Name')].trim();
    const skuRaw = r[idx('Item #/SKU')].trim();
    const itemType = r[idx('Item Type')].trim();
    const costStr = r[idx('Unit Cost')].trim();
    const priceStr = r[idx('Unit Price')].trim();
    const longDesc = r[idx('Description')].trim();

    const { code, categoryRaw, itemName } = parsePrefix(fullName);
    const costCents = parseDollarsToCents(costStr);
    const priceCents = parseDollarsToCents(priceStr);

    const skipReason = shouldSkip({
      itemType,
      code,
      categoryRaw,
      itemName,
      costCents,
      priceCents,
    });
    if (skipReason) {
      skipped[skipReason] = (skipped[skipReason] || 0) + 1;
      continue;
    }

    const lineType = classifyLineType(itemType, categoryRaw);

    // For services that already encode customer-facing dollars in Unit Price,
    // store unit_cost_cents = price so the engine's pass-through behavior
    // preserves Nick's pre-marked-up labor pricing. For products, use cost.
    let unitCostCents;
    if (itemType === 'service') {
      // Prefer Unit Price (customer-facing); fall back to Unit Cost.
      unitCostCents = priceCents ?? costCents ?? 0;
    } else {
      unitCostCents = costCents ?? 0;
    }

    // Dedup webb_part_number (unique constraint is (tenant_id, webb_part_number))
    let webbPart = skuRaw || null;
    if (webbPart) {
      if (seenSku.has(webbPart)) {
        skuCollisions.push({ sku: webbPart, kept: seenSku.get(webbPart), dropped: fullName });
        webbPart = null; // null is allowed multiple times — preserves the row
      } else {
        seenSku.set(webbPart, fullName);
      }
    }

    // We store the full "NN Category | Item Name" string as `description`
    // so customer-facing PDFs match FP's labels exactly. The slug-form
    // `category` covers filtering. The long FP "Description" column lands
    // in `details` for the multi-line spec body.
    items.push({
      tenant_id: tenant.id,
      webb_part_number: webbPart,
      fp_item_id: null, // not in this export
      description: fullName,
      details: longDesc || null,
      category: categorySlug(categoryRaw),
      uom: 'each',
      unit_cost_cents: unitCostCents,
      line_type: lineType,
    });
  }

  log(`Will insert ${items.length} items.`);
  for (const [reason, count] of Object.entries(skipped)) {
    if (count > 0) log(`  skipped: ${count} (${reason})`);
  }
  if (skuCollisions.length > 0) {
    log(`  ${skuCollisions.length} duplicate SKUs collapsed (kept first occurrence; later rows imported with null SKU)`);
    for (const { sku, kept, dropped } of skuCollisions.slice(0, 5)) {
      log(`    ${sku}: kept "${kept}", null'd on "${dropped}"`);
    }
    if (skuCollisions.length > 5) log(`    ... and ${skuCollisions.length - 5} more`);
  }

  // --- Wipe + reload ---
  log('Truncating existing items for this tenant...');
  const { error: delErr } = await supabase
    .from('items')
    .delete()
    .eq('tenant_id', tenant.id);
  if (delErr) fail(`Truncate failed: ${delErr.message}`);

  // Insert in batches of 500 to stay under any URL/body limits.
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH);
    const { error: insErr } = await supabase.from('items').insert(slice);
    if (insErr) {
      fail(
        `Insert failed at batch starting ${i}: ${insErr.message}\n` +
          `First row in failing batch: ${JSON.stringify(slice[0])}`,
      );
    }
    inserted += slice.length;
    log(`  ...inserted ${inserted} / ${items.length}`);
  }

  // --- Verify ---
  const { count, error: countErr } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id);
  if (countErr) fail(`Count check failed: ${countErr.message}`);
  log(`Done. items table now has ${count} rows for tenant ${tenant.name}.`);

  // Quick category breakdown for sanity
  const { data: catRows } = await supabase
    .from('items')
    .select('category, line_type')
    .eq('tenant_id', tenant.id);
  if (catRows) {
    const byCat = {};
    const byType = {};
    for (const r of catRows) {
      byCat[r.category ?? '(none)'] = (byCat[r.category ?? '(none)'] || 0) + 1;
      byType[r.line_type] = (byType[r.line_type] || 0) + 1;
    }
    log('By line_type:');
    for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      log(`  ${t.padEnd(10)} ${n}`);
    }
    log('Top categories:');
    const top = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    for (const [c, n] of top) {
      log(`  ${String(c).padEnd(28)} ${n}`);
    }
  }
}

// ---------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`\nERROR: ${msg}\n\n`);
  process.exit(1);
}

main().catch((err) => {
  fail(err?.stack ?? String(err));
});
