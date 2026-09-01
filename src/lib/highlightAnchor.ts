import type { ParsedPage } from './parsePage';
import type { Highlight, HighlightColor } from './types';

/** A highlight's position, before a colour or note is attached to it. */
export type Anchor = {
  page: number;
  para_index: number;
  start_off: number;
  end_off: number;
  text: string;
};

/** True when the element's contents overlap the range (touching is not enough). */
function overlaps(range: Range, el: Element): boolean {
  const r = document.createRange();
  r.selectNodeContents(el);
  return (
    range.compareBoundaryPoints(Range.END_TO_START, r) < 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, r) > 0
  );
}

/**
 * Turns a live DOM selection into stored coordinates.
 *
 * Only word spans carry a `data-key`, so the range is resolved against those
 * and the result snaps outward to whole words — half a highlighted word is
 * never what someone meant. A selection crossing paragraphs yields one anchor
 * per paragraph rather than one anchor spanning the gap between them.
 */
export function anchorsFromSelection(
  range: Range,
  parsed: ParsedPage,
  root: HTMLElement,
  page: number,
): Anchor[] {
  const byPara = new Map<number, { start: number; end: number }>();

  for (const el of Array.from(root.querySelectorAll<HTMLElement>('.w'))) {
    const key = el.dataset.key;
    if (!key || !overlaps(range, el)) continue;
    const ref = parsed.words.get(key);
    if (!ref) continue;

    const start = ref.offset;
    const end = ref.offset + ref.term.length;
    const cur = byPara.get(ref.paraIndex);
    if (cur) {
      cur.start = Math.min(cur.start, start);
      cur.end = Math.max(cur.end, end);
    } else {
      byPara.set(ref.paraIndex, { start, end });
    }
  }

  return [...byPara.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([para_index, { start, end }]) => ({
      page,
      para_index,
      start_off: start,
      end_off: end,
      text: (parsed.paragraphs[para_index] ?? '').slice(start, end),
    }));
}

export type HlToken = {
  id: string;
  color: HighlightColor;
  note: string | null;
  /** Last token of this highlight — where the note marker is hung. */
  isEnd: boolean;
};

/**
 * The reverse: which rendered tokens each highlight covers, so Page can paint
 * them. Whitespace tokens between two highlighted words are included on
 * purpose — without them a highlight renders as striped words rather than one
 * continuous band.
 */
export function tokensForHighlights(
  parsed: ParsedPage,
  highlights: Highlight[],
): Map<string, HlToken> {
  const out = new Map<string, HlToken>();

  for (const h of highlights) {
    const tokens = parsed.rendered[h.para_index];
    if (!tokens) continue;

    const covered = tokens.filter((t) => {
      const s = t.offset;
      const e = t.offset + t.text.length;
      return s < h.end_off && e > h.start_off;
    });

    covered.forEach((t, i) => {
      out.set(t.key, {
        id: h.id,
        color: h.color,
        note: h.note,
        isEnd: i === covered.length - 1,
      });
    });
  }
  return out;
}
