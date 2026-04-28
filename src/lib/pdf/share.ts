/**
 * PDF share / download helpers.
 *
 * On phones we want the native share sheet (Mail, iMessage, AirDrop, Save).
 * On desktop we just trigger a download. The Web Share API tells us at
 * runtime which path we can take — `canShare({ files })` returns false
 * everywhere except iOS Safari and a few mobile browsers, so the
 * fallback chain is honest.
 */

export interface SharePDFArgs {
  blob: Blob;
  filename: string;
  /** Title shown in the iOS share sheet preview. */
  title?: string;
}

/**
 * Returns true if the platform can share files via the Web Share API.
 * Used to swap button copy ("Send to customer" vs "Download PDF").
 */
export function canSharePDFFiles(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!('canShare' in navigator) || typeof navigator.canShare !== 'function') return false;
  // Probe with a tiny dummy file — canShare requires a File array.
  const probe = new File(['x'], 'probe.pdf', { type: 'application/pdf' });
  try {
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Best-effort: open the native share sheet on phones, fall back to
 * download on desktop. Both paths resolve when the user dismisses the
 * UI (or immediately on download).
 */
export async function sharePDF({ blob, filename, title }: SharePDFArgs): Promise<void> {
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (canSharePDFFiles()) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (err) {
      // User cancelled — silently fall through to download as a backup.
      const e = err as { name?: string };
      if (e?.name !== 'AbortError') {
        // Real error — log and fall through.
        // eslint-disable-next-line no-console
        console.warn('navigator.share failed; falling back to download', err);
      } else {
        return; // user explicitly cancelled, don't auto-download
      }
    }
  }

  // Download path
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a beat so the browser has time to read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
