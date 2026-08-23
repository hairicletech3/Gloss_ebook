import { tokenize, type Token } from './tokenize';

export type RenderedToken = Token & { key: string; offset: number };

export type WordRef = {
  key: string;
  term: string;
  /** Index into `paragraphs`, for pulling the sentence around the word. */
  paraIndex: number;
  /** Character offset of the word inside that paragraph. */
  offset: number;
};

export type ParsedPage = {
  paragraphs: string[];
  /** Keyed `page:paragraph:token` so glosses survive a page turn. */
  words: Map<string, WordRef>;
  rendered: RenderedToken[][];
};

export function parsePage(
  text: string,
  pageIndex: number,
  locale: string | undefined,
): ParsedPage {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const words = new Map<string, WordRef>();

  const rendered = paragraphs.map((para, pi) => {
    let offset = 0;
    return tokenize(para, locale).map((tok, ti): RenderedToken => {
      const at = offset;
      offset += tok.text.length;
      const key = `${pageIndex}:${pi}:${ti}`;
      if (tok.isWord) words.set(key, { key, term: tok.text, paraIndex: pi, offset: at });
      return { ...tok, key, offset: at };
    });
  });

  return { paragraphs, words, rendered };
}
