/**
 * Tokenizer.
 *
 * The prototype used `split(/(\s+)/)`, which produces one giant "word" for
 * Japanese, Chinese, Thai and Khmer. `Intl.Segmenter` is built into every
 * modern browser and segments all of them correctly, so it is the v1
 * tokenizer — retrofitting it later would mean touching every render path.
 */

export type Token = {
  text: string;
  /** True for segments that should become a clickable `.w` span. */
  isWord: boolean;
};

const wordSegmenters = new Map<string, Intl.Segmenter>();
const sentenceSegmenters = new Map<string, Intl.Segmenter>();

const hasSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';

function getSegmenter(
  cache: Map<string, Intl.Segmenter>,
  locale: string | undefined,
  granularity: 'word' | 'sentence',
): Intl.Segmenter {
  const key = locale ?? '';
  let s = cache.get(key);
  if (!s) {
    s = new Intl.Segmenter(locale, { granularity });
    cache.set(key, s);
  }
  return s;
}

/** Fallback for the (rare) runtime without Intl.Segmenter: the prototype's tokenizer. */
function tokenizeByWhitespace(text: string): Token[] {
  const out: Token[] = [];
  for (const tok of text.split(/(\s+)/)) {
    if (!tok) continue;
    if (!/\S/.test(tok)) {
      out.push({ text: tok, isWord: false });
      continue;
    }
    const m = tok.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
    if (!m || !m[2]) {
      out.push({ text: tok, isWord: false });
      continue;
    }
    const [, pre, core, post] = m;
    if (pre) out.push({ text: pre, isWord: false });
    out.push({ text: core, isWord: true });
    if (post) out.push({ text: post, isWord: false });
  }
  return out;
}

export function tokenize(text: string, locale?: string): Token[] {
  if (!hasSegmenter) return tokenizeByWhitespace(text);
  const seg = getSegmenter(wordSegmenters, locale, 'word');
  const out: Token[] = [];
  for (const s of seg.segment(text)) {
    out.push({ text: s.segment, isWord: Boolean(s.isWordLike) });
  }
  return out;
}

/**
 * The sentence a word sits in — stored as `context` on saved words and sent
 * to the translator so single words get the sense used *here*.
 */
export function sentenceAt(paragraph: string, offset: number, locale?: string): string {
  if (!hasSegmenter) {
    const start = Math.max(0, paragraph.lastIndexOf('.', offset) + 1);
    const dot = paragraph.indexOf('.', offset);
    return paragraph.slice(start, dot === -1 ? paragraph.length : dot + 1).trim();
  }
  const seg = getSegmenter(sentenceSegmenters, locale, 'sentence');
  let last = paragraph;
  for (const s of seg.segment(paragraph)) {
    last = s.segment;
    if (s.index + s.segment.length > offset) return s.segment.trim();
  }
  return last.trim();
}
