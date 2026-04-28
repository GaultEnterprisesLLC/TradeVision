import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCompany, useCompanySettings } from '@/lib/queries/company';
import {
  effectivePricing,
  useQuote,
  useQuoteAddons,
  useQuoteDiscounts,
  useQuoteLines,
} from '@/lib/queries/quotes';
import { composeQuoteForPDF } from '@/lib/pdf/composeQuoteForPDF';
import { sendQuotePDF } from '@/components/pdf';
import { Button } from '@/components/ui';

/**
 * /quotes/:id/preview — inline PDF preview for layout iteration.
 *
 * Renders @react-pdf's <PDFViewer> with the same QuotePDF document that
 * gets emailed to the customer. Useful for fast brand/layout work on the
 * desktop without bouncing through the download every time.
 *
 * The PDFViewer component is lazy-loaded — keeps the main bundle small
 * and means the heavy renderer only ships on this route.
 */

// Lazy because react-pdf is huge.
const PDFViewerLazy = lazy(async () => {
  const mod = await import('@react-pdf/renderer');
  return { default: mod.PDFViewer };
});
const QuotePDFLazy = lazy(async () => {
  const mod = await import('@/components/pdf/QuotePDF');
  return { default: mod.QuotePDF };
});

export default function QuotePreview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: company } = useCompany();
  const { data: liveSettings } = useCompanySettings(company?.id);
  const { data: quote, isLoading: quoteLoading } = useQuote(id);
  const { data: lines = [] } = useQuoteLines(id);
  const { data: addons = [] } = useQuoteAddons(id);
  const { data: discounts = [] } = useQuoteDiscounts(id);

  const pricing = useMemo(
    () => (quote ? effectivePricing(quote, liveSettings) : null),
    [quote, liveSettings],
  );

  const doc = useMemo(() => {
    if (!company || !quote || !pricing) return null;
    return composeQuoteForPDF({ company, quote, lines, addons, discounts, pricing });
  }, [company, quote, lines, addons, discounts, pricing]);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [doc]);

  async function handleSend() {
    if (!doc) return;
    setSending(true);
    setError(null);
    try {
      await sendQuotePDF(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  if (quoteLoading || !quote) {
    return (
      <div className="px-4 py-12 text-center text-sm text-[var(--color-muted)]">
        Loading quote…
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="px-4 py-12 text-center text-sm text-[var(--color-muted)]">
        Couldn't compose the PDF (missing pricing settings or company).
      </div>
    );
  }

  return (
    <div
      className="flex flex-col bg-[var(--color-carbon)]"
      style={{ height: '100svh' }}
    >
      {/* Toolbar — full width, no AppShell wrapper. */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <Link
          to={`/quotes/${quote.id}/edit`}
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          ← Back to editor
        </Link>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(-1)}
          >
            Close
          </Button>
          <Button size="sm" onClick={handleSend} disabled={sending}>
            {sending ? 'Preparing…' : 'Send to customer'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-[var(--color-danger)] px-4 py-2 text-center">
          {error}
        </p>
      )}

      {/* Inline PDF — lazy-loaded chunk. flex-1 + min-h-0 makes the iframe
          fill the remaining viewport height. */}
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-muted)]">
            Loading PDF preview…
          </div>
        }
      >
        <div className="flex-1 min-h-0 bg-white">
          <PDFViewerLazy
            style={{ width: '100%', height: '100%', border: 'none' }}
            showToolbar
          >
            <QuotePDFLazy doc={doc} />
          </PDFViewerLazy>
        </div>
      </Suspense>
    </div>
  );
}
