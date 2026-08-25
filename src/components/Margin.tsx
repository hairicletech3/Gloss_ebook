import type { Word } from '../lib/types';
import { exportCSV, exportJSON } from '../lib/exportWords';

type Props = {
  words: Word[];
  open: boolean;
  onJump: (page: number) => void;
  onDelete: (id: string) => void;
};

export function Margin({ words, open, onJump, onDelete }: Props) {
  return (
    <aside className={'margin' + (open ? ' open' : '')}>
      <div className="margin-head">
        <h3>Margin</h3>
        <span className="count">
          {words.length} {words.length === 1 ? 'word' : 'words'}
        </span>
      </div>

      <div className="margin-list">
        {words.length === 0 ? (
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
              <button className="del" title="Remove" aria-label={`Remove ${w.term}`} onClick={() => onDelete(w.id)}>
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
