/**
 * QuotePDF — Customer-facing proposal PDF.
 *
 * Built with @react-pdf/renderer (in-browser PDF generation, no server).
 * The data model is built upstream by composeQuoteForPDF — this file is
 * pure layout.
 *
 * Brand: this is the GAULT ENTERPRISES customer-facing proposal. The
 * tenant's brand (GE) leads. TradeVision appears small at the bottom
 * as a "powered by" engine credit (white-label model).
 *
 *   - Header: GE logo + "Gault Enterprises" wordmark
 *   - Accent color: GE Orange (#FF6720) for selected-option highlight
 *     and section title underlines
 *   - Body text: Navy (#3A557C) for headings, dark for line items
 *   - Footer: small TradeVision aperture + wordmark + tradevision.us
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
// COLOR PALETTE — Gault Enterprises brand
// ---------------------------------------------------------------------

const COLOR = {
  // GE brand
  navy: '#3A557C',
  orange: '#FF6720',
  red: '#EE2737',
  navySoft: '#E8EEF6',  // tinted navy for surfaces
  orangeSoft: '#FFF1E8', // tinted orange for selected backgrounds

  // Neutrals
  text: '#1A1F2B',
  muted: '#6B7280',
  border: '#D8DEE6',
  bg: '#FFFFFF',
  surface: '#F6F8FA',

  // TradeVision (only used in tiny footer engine credit)
  tvGreen: '#7FE621',
  tvCarbon: '#0D1117',
  tvBorder: '#2A3444',
};

// ---------------------------------------------------------------------
// STYLES (StyleSheet, not Tailwind — react-pdf has its own subset)
// ---------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLOR.bg,
    fontFamily: FONT.body,
    fontSize: 10,
    color: COLOR.text,
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
    borderBottomColor: COLOR.navy,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  geLogo: { width: 44, height: 44 },
  geWordmarkBlock: { flexDirection: 'column' },
  geWordmark: {
    fontFamily: FONT.display,
    fontSize: 18,
    fontWeight: 700,
    color: COLOR.navy,
    letterSpacing: 0.5,
  },
  geTagline: {
    fontSize: 8,
    color: COLOR.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  headerRight: { alignItems: 'flex-end' },
  headerLabel: {
    fontFamily: FONT.display,
    fontSize: 8,
    color: COLOR.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerValue: {
    fontFamily: FONT.mono,
    fontSize: 11,
    color: COLOR.text,
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
    color: COLOR.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metaValue: { fontSize: 11, color: COLOR.navy, fontWeight: 600 },
  metaSub: { fontSize: 9, color: COLOR.muted, marginTop: 1 },

  // ---------- section ----------
  sectionTitle: {
    fontFamily: FONT.display,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: COLOR.navy,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.orange,
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
    borderBottomColor: COLOR.border,
  },
  lineLeft: { flex: 1, paddingRight: 12 },
  lineDescription: { fontSize: 10, color: COLOR.text, fontWeight: 500 },
  lineDetails: { fontSize: 8, color: COLOR.muted, marginTop: 2, lineHeight: 1.35 },
  lineRight: { width: 90, alignItems: 'flex-end' },
  lineQty: { fontSize: 8, color: COLOR.muted, fontFamily: FONT.mono },
  linePrice: { fontSize: 10, color: COLOR.text, fontFamily: FONT.mono, fontWeight: 500 },

  // ---------- option header ----------
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: COLOR.surface,
    borderRadius: 3,
    marginTop: 6,
    marginBottom: 4,
  },
  optionHeaderSelected: {
    backgroundColor: COLOR.orangeSoft,
    borderWidth: 1.5,
    borderColor: COLOR.orange,
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
    color: COLOR.bg,
    backgroundColor: COLOR.orange,
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
    borderBottomColor: COLOR.border,
  },
  addonName: { fontSize: 10, color: COLOR.text, fontWeight: 600 },
  addonDesc: { fontSize: 8, color: COLOR.muted, marginTop: 2 },
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
  chipSelected: { backgroundColor: COLOR.orange, color: COLOR.bg },
  chipNot: { backgroundColor: COLOR.surface, color: COLOR.muted },

  // ---------- totals ----------
  totalsCard: {
    marginTop: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLOR.navy,
    borderRadius: 4,
    backgroundColor: COLOR.navySoft,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalsLabel: { fontSize: 10, color: COLOR.muted },
  totalsValue: { fontSize: 11, fontFamily: FONT.mono, color: COLOR.text },
  totalsGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLOR.navy,
  },
  totalsGrandLabel: {
    fontFamily: FONT.display,
    fontSize: 14,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: COLOR.navy,
  },
  totalsGrandValue: {
    fontFamily: FONT.mono,
    fontSize: 18,
    fontWeight: 600,
    color: COLOR.navy,
  },

  // ---------- notes ----------
  notesBlock: {
    marginTop: 14,
    padding: 10,
    backgroundColor: COLOR.surface,
    borderRadius: 4,
  },
  notesText: { fontSize: 9, color: COLOR.text, lineHeight: 1.45 },

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
    borderTopColor: COLOR.border,
  },
  poweredBy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  poweredByLabel: {
    fontSize: 7,
    color: COLOR.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginRight: 2,
  },
  tvWordmark: {
    fontFamily: FONT.display,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  tvWordmarkTrade: { color: COLOR.text },
  tvWordmarkVision: { color: COLOR.tvGreen },
  tvUrl: {
    fontFamily: FONT.mono,
    fontSize: 7,
    color: COLOR.muted,
    marginLeft: 4,
  },
  footerPage: {
    fontFamily: FONT.mono,
    fontSize: 8,
    color: COLOR.muted,
  },
});

// ---------------------------------------------------------------------
// TRADEVISION APERTURE MARK (small, for footer "powered by" credit)
// ---------------------------------------------------------------------

function TradeVisionAperture({ size = 12 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Circle cx="32" cy="32" r="26" stroke={COLOR.tvGreen} strokeWidth="3" fill="none" />
      <Line x1="32" y1="2" x2="32" y2="22" stroke={COLOR.tvBorder} strokeWidth="2" />
      <Line x1="32" y1="42" x2="32" y2="62" stroke={COLOR.tvBorder} strokeWidth="2" />
      <Line x1="2" y1="32" x2="22" y2="32" stroke={COLOR.tvBorder} strokeWidth="2" />
      <Line x1="42" y1="32" x2="62" y2="32" stroke={COLOR.tvBorder} strokeWidth="2" />
      <Line x1="32" y1="6" x2="32" y2="14" stroke={COLOR.tvGreen} strokeWidth="3" />
      <Line x1="32" y1="50" x2="32" y2="58" stroke={COLOR.tvGreen} strokeWidth="3" />
      <Line x1="6" y1="32" x2="14" y2="32" stroke={COLOR.tvGreen} strokeWidth="3" />
      <Line x1="50" y1="32" x2="58" y2="32" stroke={COLOR.tvGreen} strokeWidth="3" />
      <Circle cx="32" cy="32" r="4" fill={COLOR.tvGreen} />
    </Svg>
  );
}

// ---------------------------------------------------------------------
// SUBCOMPONENTS
// ---------------------------------------------------------------------

function Header({ doc }: { doc: PDFDocumentModel }) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        <Image src="/ge-logo.png" style={styles.geLogo} />
        <View style={styles.geWordmarkBlock}>
          <Text style={styles.geWordmark}>{doc.company.name}</Text>
          {doc.company.legal_name &&
            doc.company.legal_name !== doc.company.name && (
              <Text style={styles.geTagline}>{doc.company.legal_name}</Text>
            )}
        </View>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.headerLabel}>Quote</Text>
        <Text style={styles.headerValue}>#{doc.quote_number}</Text>
        <Text style={[styles.headerLabel, { marginTop: 4 }]}>{doc.created_date}</Text>
      </View>
    </View>
  );
}

function MetaBlock({ doc }: { doc: PDFDocumentModel }) {
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

function ScopeBlock({ doc }: { doc: PDFDocumentModel }) {
  if (!doc.work_order_description) return null;
  return (
    <View>
      <Text style={styles.sectionTitle}>Scope of Work · {doc.module_label}</Text>
      <Text style={styles.notesText}>{doc.work_order_description}</Text>
    </View>
  );
}

function LineRow({ line }: { line: PDFLine }) {
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

function OptionBlock({ option }: { option: PDFOption }) {
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
          <Text
            style={[
              styles.optionLabel,
              { color: option.is_selected ? COLOR.orange : COLOR.navy },
            ]}
          >
            {option.label}
          </Text>
          {option.is_selected && <Text style={styles.selectedChip}>Selected</Text>}
        </View>
        <Text
          style={[
            styles.optionPrice,
            { color: option.is_selected ? COLOR.orange : COLOR.navy },
          ]}
        >
          {moneyWhole(option.price_total_cents)}
        </Text>
      </View>

      {option.lines.map((l) => (
        <LineRow key={l.id} line={l} />
      ))}
      {option.shared_lines.map((l) => (
        <LineRow key={`shared-${l.id}`} line={l} />
      ))}
    </View>
  );
}

function AddonsBlock({ addons }: { addons: PDFAddon[] }) {
  if (addons.length === 0) return null;

  const selected = addons.filter((a) => a.is_selected);
  const available = addons.filter((a) => !a.is_selected);

  return (
    <View>
      {selected.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Add-Ons · Included</Text>
          {selected.map((a) => (
            <AddonRow key={a.id} addon={a} />
          ))}
        </>
      )}
      {available.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Available Add-Ons</Text>
          {available.map((a) => (
            <AddonRow key={a.id} addon={a} />
          ))}
        </>
      )}
    </View>
  );
}

function AddonRow({ addon }: { addon: PDFAddon }) {
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
              <LineRow key={l.id} line={l} />
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

function Totals({ doc }: { doc: PDFDocumentModel }) {
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
          <Text style={[styles.totalsLabel, { color: COLOR.red }]}>− {d.label}</Text>
          <Text style={[styles.totalsValue, { color: COLOR.red }]}>
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

function NotesBlock({ doc }: { doc: PDFDocumentModel }) {
  if (!doc.notes) return null;
  return (
    <View style={styles.notesBlock}>
      <Text style={styles.notesText}>{doc.notes}</Text>
    </View>
  );
}

/**
 * Footer — required on every page per brand spec. The TradeVision credit
 * is small ("Powered by") so the GE proposal feels GE-owned, while still
 * carrying the platform attribution the white-label model relies on.
 */
function Footer() {
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

  return (
    <Document title={title} author={doc.company.name} subject="Quote">
      <Page size="LETTER" style={styles.page}>
        <Header doc={doc} />
        <MetaBlock doc={doc} />
        <ScopeBlock doc={doc} />

        {doc.options.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>
              {doc.options.length === 1 ? 'Quote Detail' : 'Options'}
            </Text>
            {doc.options.map((o) => (
              <OptionBlock key={o.variant} option={o} />
            ))}
          </View>
        )}

        <AddonsBlock addons={doc.addons} />
        <Totals doc={doc} />
        <NotesBlock doc={doc} />

        <Footer />
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
