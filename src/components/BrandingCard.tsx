import { useRef, useState } from 'react';
import { Button, Card, CardHeader, CardTitle, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useUpdateCompany, uploadCompanyLogo } from '@/lib/queries/company';
import type { Company } from '@/types/database';

/**
 * Branding card — what the customer-facing PDF will look like for THIS
 * company. Fields:
 *
 *   - Logo (uploaded to Supabase Storage, public URL stored on companies.logo_url)
 *   - Primary color (heading text, totals border)
 *   - Accent color (selected highlights, section underlines)
 *
 * The schema is per-company (not per-tenant) so a multi-company tenant
 * can run distinct brands — useful when one TradeVision login owns
 * Gault Plumbing + Gault HVAC as separate operating entities.
 *
 * Defaults if either color is null:
 *   primary  → #3A557C  (universal pro navy)
 *   accent   → #3B82F6  (universal pro blue)
 */
const DEFAULT_PRIMARY = '#3A557C';
const DEFAULT_ACCENT = '#3B82F6';

export function BrandingCard({ company }: { company: Company }) {
  const update = useUpdateCompany();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Local edit state seeded from the server. We commit on Save.
  const [primary, setPrimary] = useState(
    company.brand_color_primary ?? DEFAULT_PRIMARY,
  );
  const [accent, setAccent] = useState(
    company.brand_color_accent ?? DEFAULT_ACCENT,
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(company.logo_url);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty =
    primary !== (company.brand_color_primary ?? DEFAULT_PRIMARY) ||
    accent !== (company.brand_color_accent ?? DEFAULT_ACCENT) ||
    logoUrl !== company.logo_url;

  async function handleLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadCompanyLogo({
        tenantId: company.tenant_id,
        file,
      });
      setLogoUrl(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-picked if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSave() {
    setSavedAt(null);
    await update.mutateAsync({
      companyId: company.id,
      patch: {
        brand_color_primary: primary,
        brand_color_accent: accent,
        logo_url: logoUrl,
      },
    });
    setSavedAt(Date.now());
  }

  function handleRemoveLogo() {
    setLogoUrl(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
      </CardHeader>

      <div className="flex flex-col gap-5">
        <p className="text-xs text-[var(--color-muted)]">
          What appears at the top of every customer-facing quote PDF.
        </p>

        {/* ============ LOGO ============ */}
        <div className="flex flex-col gap-2">
          <span
            className="text-xs uppercase tracking-wider text-[var(--color-muted)]"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            Header logo
          </span>
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'h-20 w-32 rounded-[var(--radius-md)] border border-[var(--color-border)]',
                'flex items-center justify-center bg-white overflow-hidden',
              )}
            >
              {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoUrl}
                  alt="Company logo"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-xs text-[var(--color-muted)] uppercase tracking-wider">
                  No logo
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
              </Button>
              {logoUrl && (
                <Button variant="ghost" size="sm" onClick={handleRemoveLogo}>
                  Remove
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleLogoPick}
                className="hidden"
              />
              <p className="text-xs text-[var(--color-muted)]">
                PNG / SVG, ≤5 MB. Wide aspect ratio works best (3:1 or wider).
              </p>
              {uploadError && (
                <p className="text-xs text-[var(--color-danger)]">
                  {uploadError}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ============ COLORS ============ */}
        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label="Primary"
            hint="Headings & totals"
            value={primary}
            onChange={setPrimary}
            fallback={DEFAULT_PRIMARY}
          />
          <ColorField
            label="Accent"
            hint="Selected highlight"
            value={accent}
            onChange={setAccent}
            fallback={DEFAULT_ACCENT}
          />
        </div>

        {/* ============ LIVE PREVIEW ============ */}
        <div className="flex flex-col gap-2">
          <span
            className="text-xs uppercase tracking-wider text-[var(--color-muted)]"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            Preview
          </span>
          <BrandingPreview
            companyName={company.name}
            legalName={company.legal_name}
            logoUrl={logoUrl}
            primary={primary}
            accent={accent}
          />
        </div>

        {/* ============ SAVE ============ */}
        <div className="flex items-center justify-between">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!dirty || update.isPending}
          >
            {update.isPending ? 'Saving…' : 'Save branding'}
          </Button>
          {savedAt && !dirty && (
            <span className="text-xs text-[var(--color-green)]">Saved.</span>
          )}
          {update.error && (
            <span className="text-xs text-[var(--color-danger)]">
              {update.error.message}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------
// ColorField — hex picker + text input pair, with default-value reset
// ---------------------------------------------------------------------

function ColorField({
  label,
  hint,
  value,
  onChange,
  fallback,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  fallback: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="text-xs uppercase tracking-wider text-[var(--color-muted)]"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
      >
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-12 w-14 rounded-[var(--radius-md)] cursor-pointer',
            'border border-[var(--color-border)] bg-[var(--color-carbon)]',
          )}
          // The browser's color picker pad — no need to style further.
          aria-label={`${label} color`}
        />
        <Input
          name={`${label}-hex`}
          value={value.toUpperCase()}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback}
          className="flex-1 font-mono uppercase"
        />
      </div>
      <p className="text-xs text-[var(--color-muted)]">{hint}</p>
    </div>
  );
}

// ---------------------------------------------------------------------
// BrandingPreview — small mock of the PDF header + a "Selected" chip,
// rendered in light mode (matches the actual customer-facing PDF surface).
// ---------------------------------------------------------------------

function BrandingPreview({
  companyName,
  legalName,
  logoUrl,
  primary,
  accent,
}: {
  companyName: string;
  legalName: string | null;
  logoUrl: string | null;
  primary: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-[var(--radius-md)] p-4 flex flex-col gap-3"
      style={{
        backgroundColor: '#FFFFFF',
        borderTop: `2px solid ${primary}`,
        borderColor: '#D8DEE6',
        borderWidth: 1,
        borderStyle: 'solid',
        // top border is 2px primary; rest is light gray
        borderTopWidth: 2,
        borderTopColor: primary,
      }}
    >
      {/* Mock header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="h-10 max-w-[120px] object-contain"
            />
          ) : (
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: primary }}
            >
              {companyName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span
              className="text-base font-bold truncate"
              style={{ color: primary, fontFamily: 'var(--font-display)' }}
            >
              {companyName}
            </span>
            {legalName && legalName !== companyName && (
              <span
                className="text-[10px] uppercase tracking-wider truncate"
                style={{ color: '#6B7280' }}
              >
                {legalName}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="text-[10px] uppercase tracking-wider"
            style={{ color: '#6B7280', fontFamily: 'var(--font-display)' }}
          >
            Quote
          </div>
          <div
            className="text-sm font-mono"
            style={{ color: '#1A1F2B' }}
          >
            #ABCD1234
          </div>
        </div>
      </div>

      {/* Section title with accent underline */}
      <div
        className="text-xs uppercase tracking-wider font-bold pb-1"
        style={{
          color: primary,
          borderBottom: `1px solid ${accent}`,
          fontFamily: 'var(--font-display)',
        }}
      >
        Quote Detail
      </div>

      {/* "Selected" option chip */}
      <div
        className="flex items-center justify-between rounded-[var(--radius-sm)] p-2"
        style={{
          backgroundColor: hexToRGBA(accent, 0.08),
          border: `1.5px solid ${accent}`,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-xs uppercase tracking-wider font-bold"
            style={{ color: accent, fontFamily: 'var(--font-display)' }}
          >
            Quote
          </span>
          <span
            className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded text-white"
            style={{ backgroundColor: accent }}
          >
            Selected
          </span>
        </div>
        <span
          className="font-mono text-sm font-semibold"
          style={{ color: accent }}
        >
          $4,120
        </span>
      </div>
    </div>
  );
}

/** "#FF6720" + 0.08 → "rgba(255, 103, 32, 0.08)". */
function hexToRGBA(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length !== 6) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
