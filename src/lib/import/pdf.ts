import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Ported from the prototype's readPDF(). There is no line-break information
 * in a PDF text layer, so breaks are reconstructed from the Y-coordinate
 * deltas in item.transform[5]. This is the roughest part of the codebase —
 * expect to tune these two thresholds against real books.
 */
const LINE_BREAK_PX = 4;
const PARA_BREAK_PX = 14;

export async function readPDF(
  buf: ArrayBuffer,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  // pdf.js transfers and detaches the buffer it is given; hand it a copy so the
  // caller can still upload the original bytes to Storage afterwards.
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    let out = '';
    let lastY: number | null = null;
    for (const raw of content.items) {
      const item = raw as TextItem;
      if (typeof item.str !== 'string') continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > LINE_BREAK_PX) {
        out += Math.abs(y - lastY) > PARA_BREAK_PX ? '\n\n' : ' ';
      }
      out += item.str;
      lastY = y;
    }
    pages.push(
      out
        .replace(/-\n+/g, '') // rejoin words hyphenated across a line end
        .replace(/[ \t]+/g, ' ')
        .trim(),
    );
    onProgress?.(i, pdf.numPages);
  }
  await pdf.destroy();
  return pages.filter(Boolean);
}
