import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HIGHLIGHT_COLORS } from '../lib/highlights';
import type { Highlight, HighlightColor } from '../lib/types';

type Props = {
  anchor: DOMRect;
  highlight: Highlight;
  onSaveNote: (note: string | null) => void;
  onColor: (color: HighlightColor) => void;
  onDelete: () => void;
  onClose: () => void;
};

const GAP = 10;

/** Edits an existing highlight: its note, its colour, or removing it. */
export function NoteCard({
  anchor,
  highlight,
  onSaveNote,
  onColor,
  onDelete,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [note, setNote] = useState(highlight.note ?? '');

  useEffect(() => {
    setNote(highlight.note ?? '');
  }, [highlight.id, highlight.note]);

  // Same clamping as PhraseCard — measure once laid out, then keep it inside
  // the viewport on both axes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchor.left + anchor.width / 2 - width / 2;
    left = Math.min(Math.max(GAP, left), Math.max(GAP, vw - width - GAP));

    let top = anchor.bottom + GAP;
    if (top + height > vh - GAP) top = anchor.top - height - GAP;
    top = Math.min(Math.max(GAP, top), Math.max(GAP, vh - height - GAP));

    setPos({ left, top });
  }, [anchor]);

  const dirty = note.trim() !== (highlight.note ?? '');

  return (
    <div
      ref={ref}
      className="card notecard"
      role="dialog"
      aria-label="Edit highlight"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      <button
        className="card-close"
        onClick={onClose}
        title="Close"
        aria-label="Close"
      >
        ×
      </button>

      <div className="src">{highlight.text}</div>

      <div className="swatches" role="group" aria-label="Highlight colour">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c.id}
            className={'swatch sw-' + c.id + (c.id === highlight.color ? ' on' : '')}
            title={c.label}
            aria-label={c.label}
            aria-pressed={c.id === highlight.color}
            onClick={() => onColor(c.id)}
          />
        ))}
      </div>

      <textarea
        className="note-input"
        placeholder="Write a note…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />

      <div className="act">
        <button
          className="chip solid"
          onClick={() => onSaveNote(note.trim() ? note.trim() : null)}
          disabled={!dirty}
        >
          Save note
        </button>
        <button className="chip" onClick={onDelete} title="Remove this highlight">
          Remove
        </button>
      </div>
    </div>
  );
}
