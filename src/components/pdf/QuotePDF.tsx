/**
 * QuotePDF — TradeVision customer-facing proposal PDF.
 *
 * Built with @react-pdf/renderer (in-browser PDF generation, no server).
 * The data model is built upstream by composeQuoteForPDF — this file is
 * pure layout.
 *
 * Brand notes:
 *   - Background WHITE for printability + email-friendly previews
 *     (the dark UI is for the field tool; PDFs go to homeowners).
 *   - Brand green Safety Green #7FE621 used as accent for chips,
 *     selected-option highlight, and the green dot in the aperture mark.
 *   - Typography: Barlow (body), Barlow Condensed (display), IBM Plex Mono
 *     (numerics). Loaded via Google Fonts hosting at Document init.
 *   - Required footer on every page: "Powered by TradeVision · tradevision.us"
 */

import {
  Document,
  Page,
  StyleSheet,
  Svg,
  Circle,
  Line,
  Text,
  View,
  Font,
} from '@react-pdf/renderer';
import { money, moneyWhole } from '@/lib/format';
import type {
  PDFAddon,
  PDFDocumentModel,
  PDFLine,
  PDFOption,
} from '@/lib/pdf/composeQuoteForPDF';

// ---------------------------------------------------------------------
// FONTS — register Google Fonts with @react-pdf
// ---------------------------------------------------------------------
// react-pdf needs explicit font URLs (it doesn't reuse browser-loaded
// fonts). Pulling TTF files directly from Google's static font server.

Font.register({
  family: 'Barlow',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/barlow/v12/7cHpv4kjgoGqM7E_DMs5.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/barlow/v12/7cHqv4kjgoGqM7E3w-oc4Ock.ttf', fontWeight: 500 },
    { src: 'https://fonts.gstatic.com/s/barlow/v12/7cHqv4kjgoGqM7E3t-ww4Ock.ttf', fontWeight: 600 },
    { src: 'https://fonts.gstatic.com/s/barlow/v12/7cHqv4kjgoGqM7E3_-8w4Ock.ttf', fontWeight: 700 },
  ],
});

Font.register({
  family: 'Barlow Condensed',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/barlowcondensed/v12/HTxwL3I-JCGChYJ8VI-L6OO_au7B.ttf', fontWeight: 600 },
    { src: 'https://fonts.gstatic.com/s/barlowcondensed/v12/HTxwL3I-JCGChYJ8VI-L6OO_au7B.ttf', fontWeight: 700 },
  ],
});

Font.register({
  family: 'IBM Plex Mono',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/ibmplexmono/v19/-F63fjptAgt5VM-kVkqdyU8n5igg1l9kn-s.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/ibmplexmono/v19/-F6qfjptAgt5VM-kVkqdyU8n3vAOwl1FlQ.ttf', fontWeight: 500 },
  ],
});

// ---------------------------------------------------------------------
// STYLES (StyleSheet, not Tailwind — react-pdf has its own subset)
// ---------------------------------------------------------------------

const COLOR = {
  green: '#7FE621',
  text: '#0D1117',
  muted: '#7D8590',
  border: '#D0D7DE',
  bg: '#FFFFFF',
  surface: '#F6F8FA',
  greenBg: '#EFFEC7',
  red: '#CF222E',
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLOR.bg,
    fontFamily: 'Barlow',
    fontSize: 10,
    color: COLOR.text,
    paddingTop: 36,
    paddingBottom: 56, // leave room for the absolute-positioned footer
    paddingHorizontal: 36,
  },

  // ---------- header ----------
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandWordmark: {
    fontFamily: 'Barlow Condensed',
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 1,
  },
  brandTrade: { color: COLOR.text },
  brandVision: { color: COLOR.green, fontWeight: 700 },
  headerRight: { alignItems: 'flex-end' },
  headerLabel: {
    fontFamily: 'Barlow Condensed',
    fontSize: 9,
    color: COLOR.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerValue: {
    fontFamily: 'IBM Plex Mono',
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
    fontFamily: 'Barlow Condensed',
    fontSize: 8,
    color: COLOR.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metaValue: { fontSize: 11, color: COLOR.text, fontWeight: 600 },
  metaSub: { fontSize: 9, color: COLOR.muted, marginTop: 1 },

  // ---------- section ----------
  sectionTitle: {
    fontFamily: 'Barlow Condensed',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: COLOR.text,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
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
  lineQty: { fontSize: 8, color: COLOR.muted, fontFamily: 'IBM Plex Mono' },
  linePrice: { fontSize: 10, color: COLOR.text, fontFamily: 'IBM Plex Mono', fontWeight: 500 },

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
    backgroundColor: COLOR.greenBg,
    borderWidth: 1,
    borderColor: COLOR.green,
  },
  optionLabel: {
    fontFamily: 'Barlow Condensed',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionPrice: {
    fontFamily: 'IBM Plex Mono',
    fontSize: 12,
    fontWeight: 600,
  },
  selectedChip: {
    fontFamily: 'Barlow Condensed',
    fontSize: 8,
    color: COLOR.green,
    backgroundColor: COLOR.text,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
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
    fontFamily: 'Barlow Condensed',
    fontSize: 7,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginRight: 6,
  },
  chipSelected: { backgroundColor: COLOR.green, color: COLOR.text },
  chipNot: { backgroundColor: COLOR.surface, color: COLOR.muted },

  // ---------- totals ----------
  totalsCard: {
    marginTop: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: COLOR.border,
    borderRadius: 4,
    backgroundColor: COLOR.surface,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalsLabel: { fontSize: 10, color: COLOR.muted },
  totalsValue: { fontSize: 11, fontFamily: 'IBM Plex Mono', color: COLOR.text },
  totalsGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLOR.border,
  },
  totalsGrandLabel: {
    fontFamily: 'Barlow Condensed',
    fontSize: 14,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  totalsGrandValue: {
    fontFamily: 'IBM Plex Mono',
    fontSize: 18,
    fontWeight: 600,
    color: COLOR.text,
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
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLOR.border,
  },
  footerLeft: { fontSize: 8, color: COLOR.muted },
  footerCenter: {
    fontFamily: 'Barlow Condensed',
    fontSize: 8,
    color: COLOR.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  footerPage: {
    fontFamily: 'IBM Plex Mono',
    fontSize: 8,
    color: COLOR.muted,
  },
});

// ---------------------------------------------------------------------
// APERTURE LOGOMARK (SVG, brand-correct)
// ---------------------------------------------------------------------

function ApertureMark({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Circle cx="32" cy="32" r="26" stroke={COLOR.green} strokeWidth="3" fill="none" />
      {/* Crosshair */}
      <Line x1="32" y1="2" x2="32" y2="22" stroke={COLOR.text} strokeWidth="2" />
      <Line x1="32" y1="42" x2="32" y2="62" stroke={COLOR.text} strokeWidth="2" />
      <Line x1="2" y1="32" x2="22" y2="32" stroke={COLOR.text} strokeWidth="2" />
      <Line x1="42" y1="32" x2="62" y2="32" stroke={COLOR.text} strokeWidth="2" />
      {/* Cardinal ticks */}
      <Line x1="32" y1="6" x2="32" y2="14" stroke={COLOR.green} strokeWidth="3" />
      <Line x1="32" y1="50" x2="32" y2="58" stroke={COLOR.green} strokeWidth="3" />
      <Line x1="6" y1="32" x2="14" y2="32" stroke={COLOR.green} strokeWidth="3" />
      <Line x1="50" y1="32" x2="58" y2="32" stroke={COLOR.green} strokeWidth="3" />
      <Circle cx="32" cy="32" r="4" fill={COLOR.green} />
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
        <ApertureMark />
        <Text style={styles.brandWordmark}>
          <Text style={styles.brandTrade}>Trade</Text>
          <Text style={styles.brandVision}>Vision</Text>
        </Text>
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
          <Text style={styles.optionLabel}>{option.label}</Text>
          {option.is_selected && <Text style={styles.selectedChip}>Selected</Text>}
        </View>
        <Text style={styles.optionPrice}>{moneyWhole(option.price_total_cents)}</Text>
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

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerLeft}>{` `}</Text>
      <Text style={styles.footerCenter}>Powered by TradeVision · tradevision.us</Text>
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
