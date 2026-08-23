import { Fragment } from 'react';
import type { ParsedPage } from '../lib/parsePage';

type Props = {
  parsed: ParsedPage;
  glosses: Map<string, string>;
  pending: Set<string>;
  savedTerms: Set<string>;
};

/**
 * One page of the book. Every word-like segment becomes a `.w` span; the
 * gloss is delivered through `data-gloss` and drawn by CSS ::before into the
 * space the 2.05 line-height already reserves, so the page never reflows
 * when a gloss appears.
 *
 * Clicks are handled by delegation on the container (see Reader) so a phrase
 * selection can win over the word click underneath it; keyboard activation
 * is handled there too, via the `data-key` on each span.
 */
export function Page({ parsed, glosses, pending, savedTerms }: Props) {
  return (
    <div className="text">
      {parsed.rendered.map((tokens, pi) => (
        <p key={pi}>
          {tokens.map((tok) => {
            if (!tok.isWord) return <Fragment key={tok.key}>{tok.text}</Fragment>;
            const gloss = glosses.get(tok.key);
            const isPending = pending.has(tok.key);
            const saved = savedTerms.has(tok.text.toLowerCase());
            return (
              <span
                key={tok.key}
                className={'w' + (isPending ? ' pending' : '') + (saved ? ' saved' : '')}
                data-key={tok.key}
                data-gloss={isPending ? '' : gloss}
                title={gloss}
                tabIndex={0}
                role="button"
                aria-label={gloss ? `${tok.text} — ${gloss}` : tok.text}
              >
                {tok.text}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}
