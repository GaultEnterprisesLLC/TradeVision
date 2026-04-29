/**
 * QuotePDF — Customer-facing proposal PDF.
 *
 * Built with @react-pdf/renderer (in-browser PDF generation, no server).
 * The data model is built upstream by composeQuoteForPDF — this file is
 * pure layout.
 *
 * White-label brand model:
 *  - The TENANT's brand leads (logo + name + colors). They're the seller.
 *  - TradeVision appears as a small "powered by" credit in the footer.
 *
 * Brand inputs come from the company row that's loaded into doc.company:
 *  - doc.company.logo_url           → header logo (fallback: TradeVision aperture)
 *  - doc.company.brand_color_primary → headings, totals border, big total
 *  - doc.company.brand_color_accent  → "Selected" chip, section underlines, selected-option highlight
 *
 * If either color is null we fall back to professional neutral defaults
 * so an unconfigured tenant still renders a clean PDF.
 *
 * White background for printability + email-friendly previews (the
 * dark UI is the field tool; PDFs go to homeowners).
 */

import {
  Document,
  Page,
  StyleSheet,
  Svg,
  Circle,
  Line,
  Image,
  Text,
  View,
} from '@react-pdf/renderer';
import { money, moneyWhole } from '@/lib/format';
import type {
  PDFAddon,
  PDFDocumentModel,
  PDFLine,
  PDFOption,
} from '@/lib/pdf/composeQuoteForPDF';

// ---------------------------------------------------------------------
// FONTS
// ---------------------------------------------------------------------
// Using react-pdf's built-in fonts (Helvetica / Helvetica-Bold / Courier).
// Zero network, work offline, never break.
//
// TODO (post-trial polish): self-host Barlow / Barlow Condensed / IBM
// Plex Mono via @fontsource so PDF matches brand spec typography.
const FONT = {
  body: 'Helvetica',
  bodyBold: 'Helvetica-Bold',
  display: 'Helvetica-Bold',
  mono: 'Courier',
};

// ---------------------------------------------------------------------
// COLOR PALETTE
// ---------------------------------------------------------------------
// `primary` and `accent` are pulled from the company row at render time.
// Everything else is fixed — these are professional document neutrals,
// not brand-specific.

/** Defaults when company.brand_color_* is null. Match BrandingCard.tsx. */
const DEFAULT_PRIMARY = '#3A557C'; // pro navy
const DEFAULT_ACCENT = '#3B82F6';  // pro blue

const NEUTRAL = {
  // Semantic / structural — not brand-tunable
  red: '#EE2737',     // discounts (negative numbers)
  text: '#1A1F2B',    // body
  muted: '#6B7280',   // labels, secondary
  border: '#D8DEE6',  // line dividers, table rows
  bg: '#FFFFFF',      // page
  surface: '#F6F8FA', // unselected option header background

  // TradeVision (only used in tiny footer "powered by" credit)
  tvGreen: '#7FE621',
  tvCarbon: '#0D1117',
  tvBorder: '#2A3444',
};

interface BrandColors {
  primary: string;
  accent: string;
  /** 8% tint of accent — soft background for selected-option card. */
  accentSoft: string;
  /** 8% tint of primary — soft background for totals card. */
  primarySoft: string;
}

function brandFromCompany(
  primary: string | null | undefined,
  accent: string | null | undefined,
): BrandColors {
  const p = sanitizeHex(primary) ?? DEFAULT_PRIMARY;
  const a = sanitizeHex(accent) ?? DEFAULT_ACCENT;
  return {
    primary: p,
    accent: a,
    accentSoft: hexToRGBA(a, 0.08),
    primarySoft: hexToRGBA(p, 0.08),
  };
}

function sanitizeHex(s: string | null | undefined): string | null {
  if (!s) return null;
  const cleaned = s.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(cleaned) ? cleaned : null;
}

function hexToRGBA(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------
// STYLES (per-render, parameterized by tenant brand)
// ---------------------------------------------------------------------
// Built as a function rather than a module-level const because primary
// and accent colors are tenant-specific. Cheap — react-pdf rebuilds the
// document tree on every render anyway, and StyleSheet.create is just
// shape validation.

function makeStyles(brand: BrandColors) {
  return StyleSheet.create({
    page: {
      backgroundColor: NEUTRAL.bg,
      fontFamily: FONT.body,
      fontSize: 10,
      color: NEUTRAL.text,
      paddingTop: 36,
      paddingBottom: 64, // leave room for the absolute-positioned footer
      paddingHorizontal: 36,
    },

    // ---------- header ----------
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 18,
      paddingBottom: 14,
      borderBottomWidth: 2,
      borderBottomColor: brand.primary,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
    // Modest bounding box. Going bigger only helps if the source PNG is
    // cropped tight to the artwork — most brand PNGs (Gault's included)
    // ship with significant internal whitespace, which renders as empty
    // space inside the header at large box sizes. This size is a
    // pragmatic middle: large enough to read as a logo, small enough
    // that internal whitespace doesn't dominate the page top. If a
    // tenant wants a bigger header presence, the answer is to crop the
    // source PNG, not to grow the box here.
    headerLogo: { width: 200, height: 56, objectFit: 'contain' },
    headerLogoFallback: { width: 44, height: 44 },
    wordmarkBlock: { flexDirection: 'column' },
    wordmark: {
      fontFamily: FONT.display,
      fontSize: 18,
      fontWeight: 700,
      color: brand.primary,
      letterSpacing: 0.5,
    },
    wordmarkTagline: {
      fontSize: 8,
      color: NEUTRAL.muted,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginTop: 2,
    },
    headerRight: { alignItems: 'flex-end' },
    headerLabel: {
      fontFamily: FONT.display,
      fontSize: 8,
      color: NEUTRAL.muted,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    headerValue: {
      fontFamily: FONT.mono,
      fontSize: 11,
      color: NEUTRAL.text,
      marginTop: 1,
    },

    // ---------- meta block (customer + module) ----------
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    metaCol: { flexDirection: 'column', gap: 2, flex: 1 },
    metaLabel: {
      fontFamily: FONT.display,
      fontSize: 8,
      color: NEUTRAL.muted,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    metaValue: { fontSize: 11, color: brand.primary, fontWeight: 600 },
    metaSub: { fontSize: 9, color: NEUTRAL.muted, marginTop: 1 },

    // ---------- section ----------
    sectionTitle: {
      fontFamily: FONT.display,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: brand.primary,
      borderBottomWidth: 1,
      borderBottomColor: brand.accent,
      paddingBottom: 4,
      marginTop: 14,
      marginBottom: 8,
    },

    // ---------- line items ----------
    lineRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: NEUTRAL.border,
    },
    lineLeft: { flex: 1, paddingRight: 12 },
    lineDescription: { fontSize: 10, color: NEUTRAL.text, fontWeight: 500 },
    lineDetails: { fontSize: 8, color: NEUTRAL.muted, marginTop: 2, lineHeight: 1.35 },
    lineRight: { width: 90, alignItems: 'flex-end' },
    lineQty: { fontSize: 8, color: NEUTRAL.muted, fontFamily: FONT.mono },
    linePrice: { fontSize: 10, color: NEUTRAL.text, fontFamily: FONT.mono, fontWeight: 500 },

    // ---------- option header ----------
    optionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 8,
      backgroundColor: NEUTRAL.surface,
      borderRadius: 3,
      marginTop: 6,
      marginBottom: 4,
    },
    optionHeaderSelected: {
      backgroundColor: brand.accentSoft,
      borderWidth: 1.5,
      borderColor: brand.accent,
    },
    optionLabel: {
      fontFamily: FONT.display,
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    optionPrice: {
      fontFamily: FONT.mono,
      fontSize: 12,
      fontWeight: 600,
    },
    selectedChip: {
      fontFamily: FONT.display,
      fontSize: 8,
      color: NEUTRAL.bg,
      backgroundColor: brand.accent,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 2,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginLeft: 6,
    },

    // ---------- addon / discount rows ----------
    addonRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: NEUTRAL.border,
    },
    addonName: { fontSize: 10, color: NEUTRAL.text, fontWeight: 600 },
    addonDesc: { fontSize: 8, color: NEUTRAL.muted, marginTop: 2 },
    addonStateChip: {
      fontFamily: FONT.display,
      fontSize: 7,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 2,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginRight: 6,
    },
    chipSelected: { backgroundColor: brand.accent, color: NEUTRAL.bg },
    chipNot: { backgroundColor: NEUTRAL.surface, color: NEUTRAL.muted },

    // ---------- totals ----------
    totalsCard: {
      marginTop: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: brand.primary,
      borderRadius: 4,
      backgroundColor: brand.primarySoft,
    },
    totalsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 3,
    },
    totalsLabel: { fontSize: 10, color: NEUTRAL.muted },
    totalsValue: { fontSize: 11, fontFamily: FONT.mono, color: NEUTRAL.text },
    totalsGrand: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginTop: 6,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: brand.primary,
    },
    totalsGrandLabel: {
      fontFamily: FONT.display,
      fontSize: 14,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      color: brand.primary,
    },
    totalsGrandValue: {
      fontFamily: FONT.mono,
      fontSize: 18,
      fontWeight: 600,
      color: brand.primary,
    },

    // ---------- notes ----------
    notesBlock: {
      marginTop: 14,
      padding: 10,
      backgroundColor: NEUTRAL.surface,
      borderRadius: 4,
    },
    notesText: { fontSize: 9, color: NEUTRAL.text, lineHeight: 1.45 },

    // ---------- footer ----------
    // The TradeVision "powered by" credit. Subtle, brand-correct (dark
    // chip on white page), positioned bottom-center on every page.
    footer: {
      position: 'absolute',
      bottom: 18,
      left: 36,
      right: 36,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: NEUTRAL.border,
    },
    poweredBy: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    poweredByLabel: {
      fontSize: 7,
      color: NEUTRAL.muted,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginRight: 2,
    },
    tvWordmark: {
      fontFamily: FONT.display,
      fontSize: 9,
      letterSpacing: 0.5,
    },
    tvWordmarkTrade: { color: NEUTRAL.text },
    tvWordmarkVision: { color: NEUTRAL.tvGreen },
    tvUrl: {
      fontFamily: FONT.mono,
      fontSize: 7,
      color: NEUTRAL.muted,
      marginLeft: 4,
    },
    footerPage: {
      fontFamily: FONT.mono,
      fontSize: 8,
      color: NEUTRAL.muted,
    },
  });
}

type Styles = ReturnType<typeof makeStyles>;

// ---------------------------------------------------------------------
// TRADEVISION APERTURE MARK (small, for footer "powered by" credit)
// ---------------------------------------------------------------------

function TradeVisionAperture({ size = 12 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Circle cx="32" cy="32" r="26" stroke={NEUTRAL.tvGreen} strokeWidth="3" fill="none" />
      <Line x1="32" y1="2" x2="32" y2="22" stroke={NEUTRAL.tvBorder} strokeWidth="2" />
      <Line x1="32" y1="42" x2="32" y2="62" stroke={NEUTRAL.tvBorder} strokeWidth="2" />
      <Line x1="2" y1="32" x2="22" y2="32" stroke={NEUTRAL.tvBorder} strokeWidth="2" />
      <Line x1="42" y1="32" x2="62" y2="32" stroke={NEUTRAL.tvBorder} strokeWidth="2" />
      <Line x1="32" y1="6" x2="32" y2="14" stroke={NEUTRAL.tvGreen} strokeWidth="3" />
      <Line x1="32" y1="50" x2="32" y2="58" stroke={NEUTRAL.tvGreen} strokeWidth="3" />
      <Line x1="6" y1="32" x2="14" y2="32" stroke={NEUTRAL.tvGreen} strokeWidth="3" />
      <Line x1="50" y1="32" x2="58" y2="32" stroke={NEUTRAL.tvGreen} strokeWidth="3" />
      <Circle cx="32" cy="32" r="4" fill={NEUTRAL.tvGreen} />
    </Svg>
  );
}

// ---------------------------------------------------------------------
// SUBCOMPONENTS
// ---------------------------------------------------------------------

function Header({ doc, styles }: { doc: PDFDocumentModel; styles: Styles }) {
  // When a tenant has uploaded a wordmark logo, the logo IS the company
  // name + tagline — repeating them as text right next to the artwork
  // reads as the same name three times in the same color. Render only
  // the logo in that case; the company name still appears in the
  // "Prepared by" block below for contact-info purposes.
  //
  // Fallback (no logo): show the TradeVision aperture + the company
  // name + legal_name as text, since there's no artwork carrying that
  // information.
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        {doc.company.logo_url ? (
          <Image src={doc.company.logo_url} style={styles.headerLogo} />
        ) : (
          <>
            <View style={styles.headerLogoFallback}>
              <TradeVisionAperture size={44} />
            </View>
            <View style={styles.wordmarkBlock}>
              <Text style={styles.wordmark}>{doc.company.name}</Text>
              {doc.company.legal_name &&
                doc.company.legal_name !== doc.company.name && (
                  <Text style={styles.wordmarkTagline}>{doc.company.legal_name}</Text>
                )}
            </View>
          </>
        )}
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.headerLabel}>Quote</Text>
        <Text style={styles.headerValue}>#{doc.quote_number}</Text>
        <Text style={[styles.headerLabel, { marginTop: 4 }]}>{doc.created_date}</Text>
      </View>
    </View>
  );
}

function MetaBlock({ doc, styles }: { doc: PDFDocumentModel; styles: Styles }) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaCol}>
        <Text style={styles.metaLabel}>Prepared for</Text>
        <Text style={styles.metaValue}>{doc.quote.customer_name ?? 'Customer'}</Text>
        {doc.quote.customer_address && (
          <Text style={styles.metaSub}>{doc.quote.customer_address}</Text>
        )}
      </View>
      <View style={[styles.metaCol, { alignItems: 'flex-end' }]}>
        <Text style={styles.metaLabel}>Prepared by</Text>
        <Text style={styles.metaValue}>{doc.company.name}</Text>
        {doc.company.address_line1 && (
          <Text style={styles.metaSub}>
            {doc.company.address_line1}
            {doc.company.city && `, ${doc.company.city}`}
            {doc.company.state && `, ${doc.company.state}`}
          </Text>
        )}
        {doc.company.phone && <Text style={styles.metaSub}>{doc.company.phone}</Text>}
      </View>
    </View>
  );
}

function ScopeBlock({ doc, styles }: { doc: PDFDocumentModel; styles: Styles }) {
  if (!doc.work_order_description) return null;
  return (
    <View>
      <Text style={styles.sectionTitle}>Scope of Work · {doc.module_label}</Text>
      <Text style={styles.notesText}>{doc.work_order_description}</Text>
    </View>
  );
}

function LineRow({ line, styles }: { line: PDFLine; styles: Styles }) {
  return (
    <View style={styles.lineRow}>
      <View style={styles.lineLeft}>
        <Text style={styles.lineDescription}>{line.description}</Text>
        {line.details && <Text style={styles.lineDetails}>{line.details}</Text>}
      </View>
      <View style={styles.lineRight}>
        {line.quantity !== 1 && (
          <Text style={styles.lineQty}>
            {line.quantity} × {money(line.unit_price_cents)}
          </Text>
        )}
        <Text style={styles.linePrice}>{money(line.line_total_price_cents)}</Text>
      </View>
    </View>
  );
}

function OptionBlock({
  option,
  styles,
  brand,
}: {
  option: PDFOption;
  styles: Styles;
  brand: BrandColors;
}) {
  // Selected option's label + price use accent color; unselected use primary.
  const optionTextColor = option.is_selected ? brand.accent : brand.primary;
  return (
    <View>
      <View
        style={
          option.is_selected
            ? [styles.optionHeader, styles.optionHeaderSelected]
            : styles.optionHeader
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.optionLabel, { color: optionTextColor }]}>
            {option.label}
          </Text>
          {option.is_selected && <Text style={styles.selectedChip}>Selected</Text>}
        </View>
        <Text style={[styles.optionPrice, { color: optionTextColor }]}>
          {moneyWhole(option.price_total_cents)}
        </Text>
      </View>

      {option.lines.map((l) => (
        <LineRow key={l.id} line={l} styles={styles} />
      ))}
      {option.shared_lines.map((l) => (
        <LineRow key={`shared-${l.id}`} line={l} styles={styles} />
      ))}
    </View>
  );
}

function AddonsBlock({ addons, styles }: { addons: PDFAddon[]; styles: Styles }) {
  if (addons.length === 0) return null;

  const selected = addons.filter((a) => a.is_selected);
  const available = addons.filter((a) => !a.is_selected);

  return (
    <View>
      {selected.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Add-Ons · Included</Text>
          {selected.map((a) => (
            <AddonRow key={a.id} addon={a} styles={styles} />
          ))}
        </>
      )}
      {available.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Available Add-Ons</Text>
          {available.map((a) => (
            <AddonRow key={a.id} addon={a} styles={styles} />
          ))}
        </>
      )}
    </View>
  );
}

function AddonRow({ addon, styles }: { addon: PDFAddon; styles: Styles }) {
  return (
    <View style={styles.addonRow}>
      <View style={styles.lineLeft}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={[
              styles.addonStateChip,
              addon.is_selected ? styles.chipSelected : styles.chipNot,
            ]}
          >
            {addon.is_selected ? 'Included' : 'Available'}
          </Text>
          <Text style={styles.addonName}>{addon.name}</Text>
        </View>
        {addon.description && <Text style={styles.addonDesc}>{addon.description}</Text>}
        {addon.lines.length > 0 && (
          <View style={{ marginTop: 4 }}>
            {addon.lines.map((l) => (
              <LineRow key={l.id} line={l} styles={styles} />
            ))}
          </View>
        )}
      </View>
      <View style={styles.lineRight}>
        <Text style={styles.linePrice}>{money(addon.total_cents)}</Text>
      </View>
    </View>
  );
}

function Totals({ doc, styles }: { doc: PDFDocumentModel; styles: Styles }) {
  const g = doc.grand_total;
  return (
    <View style={styles.totalsCard}>
      <View style={styles.totalsRow}>
        <Text style={styles.totalsLabel}>Selected option</Text>
        <Text style={styles.totalsValue}>{money(g.options_price_cents)}</Text>
      </View>
      {g.addons_price_cents > 0 && (
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Selected add-ons</Text>
          <Text style={styles.totalsValue}>{money(g.addons_price_cents)}</Text>
        </View>
      )}
      {doc.discounts.map((d) => (
        <View key={d.id} style={styles.totalsRow}>
          <Text style={[styles.totalsLabel, { color: NEUTRAL.red }]}>− {d.label}</Text>
          <Text style={[styles.totalsValue, { color: NEUTRAL.red }]}>
            −{money(d.amount_cents)}
          </Text>
        </View>
      ))}
      <View style={styles.totalsGrand}>
        <Text style={styles.totalsGrandLabel}>Total</Text>
        <Text style={styles.totalsGrandValue}>{money(g.grand_total_cents)}</Text>
      </View>
    </View>
  );
}

function NotesBlock({ doc, styles }: { doc: PDFDocumentModel; styles: Styles }) {
  if (!doc.notes) return null;
  return (
    <View style={styles.notesBlock}>
      <Text style={styles.notesText}>{doc.notes}</Text>
    </View>
  );
}

/**
 * Footer — required on every page. The TradeVision credit is small
 * ("Powered by") so the tenant's quote feels theirs, while still
 * carrying the platform attribution the white-label model relies on.
 */
function Footer({ styles }: { styles: Styles }) {
  return (
    <View style={styles.footer} fixed>
      <View style={styles.poweredBy}>
        <Text style={styles.poweredByLabel}>Powered by</Text>
        <TradeVisionAperture size={12} />
        <Text style={styles.tvWordmark}>
          <Text style={styles.tvWordmarkTrade}>Trade</Text>
          <Text style={styles.tvWordmarkVision}>Vision</Text>
        </Text>
        <Text style={styles.tvUrl}>tradevision.us</Text>
      </View>
      <Text
        style={styles.footerPage}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

// ---------------------------------------------------------------------
// MAIN DOCUMENT
// ---------------------------------------------------------------------

export interface QuotePDFProps {
  doc: PDFDocumentModel;
}

export function QuotePDF({ doc }: QuotePDFProps) {
  const customerName = doc.quote.customer_name?.trim() || 'Customer';
  const title = `Quote ${doc.quote_number} · ${customerName} · ${doc.module_label}`;

  // Brand colors come from the company row; styles are recomputed per-render
  // so the PDF tracks tenant branding without a global stylesheet hack.
  const brand = brandFromCompany(
    doc.company.brand_color_primary,
    doc.company.brand_color_accent,
  );
  const styles = makeStyles(brand);

  return (
    <Document title={title} author={doc.company.name} subject="Quote">
      <Page size="LETTER" style={styles.page}>
        <Header doc={doc} styles={styles} />
        <MetaBlock doc={doc} styles={styles} />
        <ScopeBlock doc={doc} styles={styles} />

        {doc.options.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>
              {doc.options.length === 1 ? 'Quote Detail' : 'Options'}
            </Text>
            {doc.options.map((o) => (
              <OptionBlock key={o.variant} option={o} styles={styles} brand={brand} />
            ))}
          </View>
        )}

        <AddonsBlock addons={doc.addons} styles={styles} />
        <Totals doc={doc} styles={styles} />
        <NotesBlock doc={doc} styles={styles} />

        <Footer styles={styles} />
      </Page>
    </Document>
  );
}

/**
 * A safe filename for downloading.
 *   "Quote-A1B2C3D4-Lovett.pdf"
 */
export function quotePDFFilename(doc: PDFDocumentModel): string {
  const customer = (doc.quote.customer_name ?? 'Customer')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'Customer';
  return `Quote-${doc.quote_number}-${customer}.pdf`;
}
