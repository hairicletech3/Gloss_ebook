import { useLayoutEffect, useRef, useState } from 'react';
import { HIGHLIGHT_COLORS } from '../lib/highlights';
import type { HighlightColor } from '../lib/types';

type Props = {
  anchor: DOMRect;
  source: string;
  translation: string | null;
  failed: boolean;
  saved: boolean;
  onSave: () => void;
  onHighlight: (color: HighlightColor) => void;
  onClose: () => void;
};

const GAP = 10;

/**
 * Known gap §5: the prototype positioned this with raw arithmetic on
 * getBoundingClientRect() and misplaced it near the viewport edges. Measure
 * the card once it is laid out, then clamp on both axes.
 */
export function PhraseCard({
  anchor,
  source,
  translation,
  failed,
  saved,
  onSave,
  onHighlight,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchor.left + anchor.width / 2 - width / 2;
    left = Math.min(Math.max(GAP, left), Math.max(GAP, vw - width - GAP));

    // Below the selection by default; flip above when it would run off the
    // bottom, then clamp so it can never leave the viewport either way.
    let top = anchor.bottom + GAP;
    if (top + height > vh - GAP) top = anchor.top - height - GAP;
    top = Math.min(Math.max(GAP, top), Math.max(GAP, vh - height - GAP));

    setPos({ left, top });
    // Re-measure when the translation lands (or fails) and the card resizes.
  }, [anchor, translation, failed]);

  return (
    <div
      ref={ref}
      className="card"
      role="dialog"
      aria-label="Phrase translation"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      <div className="src">{source}</div>
      <div className={'out' + (failed ? ' out-failed' : '')}>
        {translation ?? (failed ? 'No translation available' : '···')}
      </div>

      <div className="swatches" role="group" aria-label="Highlight this passage">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c.id}
            className={'swatch sw-' + c.id}
            title={`Highlight — ${c.label}`}
            aria-label={`Highlight — ${c.label}`}
            onClick={() => onHighlight(c.id)}
          />
        ))}
      </div>

      <div className="act">
        <button className="chip solid" onClick={onSave} disabled={!translation || saved}>
          {saved ? 'Kept' : 'Keep in margin'}
        </button>
        <button className="chip" onClick={onClose}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
