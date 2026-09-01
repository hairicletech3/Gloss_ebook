import { useState } from 'react';
import type { Highlight, Word } from '../lib/types';
import { exportCSV, exportJSON } from '../lib/exportWords';

type Props = {
  words: Word[];
  highlights: Highlight[];
  open: boolean;
  onJump: (page: number) => void;
  onDelete: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  onClose: () => void;
};

type Tab = 'words' | 'notes';

export function Margin({
  words,
  highlights,
  open,
  onJump,
  onDelete,
  onDeleteHighlight,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('words');
  const count = tab === 'words' ? words.length : highlights.length;
  const noun = tab === 'words' ? 'word' : 'note';

  return (
    <aside className={'margin' + (open ? ' open' : '')}>
      <div className="margin-head">
        <h3>Margin</h3>
        <span className="count">
          {count} {count === 1 ? noun : noun + 's'}
        </span>
        <button
          className="margin-close"
          onClick={onClose}
          title="Hide the margin"
          aria-label="Hide the margin"
        >
          ›
        </button>
      </div>

      <div className="margin-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'words'}
          className={tab === 'words' ? 'on' : ''}
          onClick={() => setTab('words')}
        >
          Words
        </button>
        <button
          role="tab"
          aria-selected={tab === 'notes'}
          className={tab === 'notes' ? 'on' : ''}
          onClick={() => setTab('notes')}
        >
          Notes
        </button>
      </div>

      <div className="margin-list">
        {tab === 'words' ? (
          words.length === 0 ? (
            <div className="margin-empty">
              Nothing collected yet. Select a word to gloss it, then press <b>S</b> — or select a
              phrase — to keep it here.
            </div>
          ) : (
            words.map((w) => (
              <div className="entry" key={w.id}>
                <div className="txt">
                  <button
                    className="term"
                    onClick={() => w.page && onJump(w.page - 1)}
                    title={w.page ? `Go to page ${w.page}` : undefined}
                  >
                    {w.term}
                  </button>
                  <span className="tr">{w.translation}</span>
                  {/* The sentence it lived in. A word without it is nearly
                      worthless for review, and it is free to store. */}
                  {w.context && <div className="ctx">{w.context}</div>}
                </div>
                <button
                  className="del"
                  title="Remove"
                  aria-label={`Remove ${w.term}`}
                  onClick={() => onDelete(w.id)}
                >
                  ×
                </button>
              </div>
            ))
          )
        ) : highlights.length === 0 ? (
          <div className="margin-empty">
            Nothing marked yet. Select a passage and pick a colour — or press <b>H</b> — to
            highlight it. Click a highlight to write a note against it.
          </div>
        ) : (
          highlights.map((h) => (
            <div className="entry" key={h.id}>
              <div className="txt">
                <button
                  className={'term hl-term hl-' + h.color}
                  onClick={() => onJump(h.page)}
                  title={`Go to page ${h.page + 1}`}
                >
                  {h.text}
                </button>
                {h.note && <div className="note-body">{h.note}</div>}
                <div className="ctx">p. {h.page + 1}</div>
              </div>
              <button
                className="del"
                title="Remove"
                aria-label="Remove this highlight"
                onClick={() => onDeleteHighlight(h.id)}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="margin-foot">
        <button className="chip" onClick={() => exportCSV(words)} disabled={!words.length}>
          Export CSV
        </button>
        <button className="chip" onClick={() => exportJSON(words)} disabled={!words.length}>
          Export JSON
        </button>
      </div>
    </aside>
  );
}
