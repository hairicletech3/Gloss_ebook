import { paginate } from './paginate';

/* pdf.js and epub.js are ~1MB between them and are only needed while
   importing a file, so they load on demand rather than on first paint. */

export { paginate };

export class ImportError extends Error {}

/** A PDF with no text layer is a stack of images. Say so plainly. */
function looksScanned(pages: string[]): boolean {
  if (!pages.length) return true;
  const sample = pages.slice(0, 8);
  const chars = sample.reduce((n, p) => n + p.replace(/\s/g, '').length, 0);
  return chars / sample.length < 40;
}

export type ExtractResult = { pages: string[] };

export async function extract(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<ExtractResult> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const buf = await file.arrayBuffer();

  let pages: string[];
  try {
    if (ext === 'pdf') {
      const { readPDF } = await import('./pdf');
      pages = await readPDF(buf, (done, total) =>
        onProgress?.(`Reading page ${done} of ${total} …`),
      );
      if (looksScanned(pages)) {
        throw new ImportError(
          'That PDF has no text layer — it is page images. Run OCR on it first, then import the result.',
        );
      }
    } else if (ext === 'epub') {
      onProgress?.('Reading the EPUB …');
      const { readEPUB } = await import('./epub');
      pages = await readEPUB(buf);
    } else {
      onProgress?.('Reading the text …');
      pages = paginate(new TextDecoder().decode(buf));
    }
  } catch (e) {
    if (e instanceof ImportError) throw e;
    console.error(e);
    throw new ImportError("Couldn't read that file — try a different export.");
  }

  pages = pages.filter((p) => p.trim().length > 0);
  if (!pages.length) throw new ImportError('No selectable text in that file.');
  return { pages };
}
