import { Fragment } from 'react';
import type { ParsedPage } from '../lib/parsePage';
import type { HlToken } from '../lib/highlightAnchor';

type Props = {
  parsed: ParsedPage;
  glosses: Map<string, string>;
  pending: Set<string>;
  savedTerms: Set<string>;
  /** Which way the reader just navigated, so the page can turn in from that side. */
  turnDir: 'next' | 'prev' | null;
  /** [start, end) paragraph indices from `parsed` that fit the screen — see useScreenChunks. */
  range: [number, number];
  /** token key → the highlight covering it, from tokensForHighlights. */
  highlighted: Map<string, HlToken>;
};

/**
 * One screen's worth of a stored page. Every word-like segment becomes a
 * `.w` span; the gloss is delivered through `data-gloss` and drawn by CSS
 * ::before into the space the 2.05 line-height already reserves, so the
 * page never reflows when a gloss appears.
 *
 * Clicks are handled by delegation on the container (see Reader) so a phrase
 * selection can win over the word click underneath it; keyboard activation
 * is handled there too, via the `data-key` on each span.
 */
export function Page({
  parsed,
  glosses,
  pending,
  savedTerms,
  turnDir,
  range,
  highlighted,
}: Props) {
  const turnClass = turnDir === 'next' ? ' turn-next' : turnDir === 'prev' ? ' turn-prev' : '';

  return (
    <div className={'text' + turnClass}>
      {parsed.rendered.slice(range[0], range[1]).map((tokens, pi) => (
        <p key={pi}>
          {tokens.map((tok) => {
            const hl = highlighted.get(tok.key);
            const hlClass = hl ? ` hl hl-${hl.color}${hl.note ? ' hl-noted' : ''}` : '';

            /* The note marker hangs off the last token of a highlight that
               has one, so a note is readable on the page itself instead of
               only in the margin. It carries data-hl, so the same click
               handling that opens a highlight opens this too. */
            const pin =
              hl?.isEnd && hl.note ? (
                <span
                  key={tok.key + ':note'}
                  className="hl-pin"
                  data-hl={hl.id}
                  data-note={hl.note}
                  role="button"
                  tabIndex={0}
                  aria-label={`Note: ${hl.note}`}
                >
                  ✎
                </span>
              ) : null;

            // Whitespace inside a highlight still needs the band drawn under
            // it, so it stops being a bare text node and becomes a span.
            if (!tok.isWord) {
              return hl ? (
                <Fragment key={tok.key}>
                  <span className={hlClass.trim()} data-hl={hl.id}>
                    {tok.text}
                  </span>
                  {pin}
                </Fragment>
              ) : (
                <Fragment key={tok.key}>{tok.text}</Fragment>
              );
            }

            const gloss = glosses.get(tok.key);
            const isPending = pending.has(tok.key);
            const saved = savedTerms.has(tok.text.toLowerCase());
            return (
              <Fragment key={tok.key}>
                <span
                  className={'w' + (isPending ? ' pending' : '') + (saved ? ' saved' : '') + hlClass}
                  data-key={tok.key}
                  data-hl={hl?.id}
                  data-gloss={isPending ? '' : gloss}
                  title={gloss}
                  tabIndex={0}
                  role="button"
                  aria-label={gloss ? `${tok.text} — ${gloss}` : tok.text}
                >
                  {tok.text}
                </span>
                {pin}
              </Fragment>
            );
          })}
        </p>
      ))}
    </div>
  );
}
