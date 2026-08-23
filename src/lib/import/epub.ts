import ePub from 'epubjs';
import { paginate } from './paginate';

/**
 * Ported from the prototype's readEPUB(). Malformed sections are common in
 * real EPUBs, so every section is wrapped — one bad chapter must not kill
 * the whole import.
 */
export async function readEPUB(buf: ArrayBuffer): Promise<string[]> {
  const book = ePub(buf);
  await book.ready;
  const out: string[] = [];
  // The spine's item type varies across epubjs builds; it is iterable either way.
  const spine = (book.spine as unknown as { spineItems: any[] }).spineItems ?? [];
  for (const item of spine) {
    try {
      const doc = await item.load(book.load.bind(book));
      const body: HTMLElement | undefined = doc?.body;
      const txt = (body ? body.innerText || body.textContent || '' : '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (txt.length > 40) out.push(...paginate(txt));
    } catch {
      /* skip unreadable section */
    } finally {
      try {
        item.unload();
      } catch {
        /* already unloaded */
      }
    }
  }
  try {
    book.destroy();
  } catch {
    /* nothing to release */
  }
  return out;
}
