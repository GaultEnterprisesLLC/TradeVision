/**
 * PDF barrel — but lazy.
 *
 * @react-pdf/renderer is ~400 KB gzipped. We don't want it loaded by
 * Quotes / Settings / etc. — only when the user actually generates a
 * PDF. Consumers must import via the dynamic helpers below; never
 * directly from QuotePDF.tsx.
 */

import type { PDFDocumentModel } from '@/lib/pdf/composeQuoteForPDF';
import { sharePDF } from '@/lib/pdf/share';

/**
 * Lazily build a PDF blob from a doc model.
 * The first call code-splits in @react-pdf/renderer; subsequent calls
 * reuse the loaded module.
 */
export async function generateQuotePDFBlob(doc: PDFDocumentModel): Promise<Blob> {
  // Dynamic import — Vite emits these as a separate chunk.
  const [{ pdf }, { QuotePDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./QuotePDF'),
  ]);
  return pdf(<QuotePDF doc={doc} />).toBlob();
}

/**
 * One-stop "send the PDF to the customer" call. Builds the blob,
 * picks the right delivery path (share sheet on phone, download on
 * desktop), and resolves when done.
 */
export async function sendQuotePDF(doc: PDFDocumentModel): Promise<void> {
  const { quotePDFFilename } = await import('./QuotePDF');
  const blob = await generateQuotePDFBlob(doc);
  const filename = quotePDFFilename(doc);
  await sharePDF({
    blob,
    filename,
    title: filename,
  });
}

/** Type re-exports — these don't pull in the renderer. */
export type { PDFDocumentModel } from '@/lib/pdf/composeQuoteForPDF';
