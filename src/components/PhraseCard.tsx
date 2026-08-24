import { useLayoutEffect, useRef, useState } from 'react';

type Props = {
  anchor: DOMRect;
  source: string;
  translation: string | null;
  saved: boolean;
  onSave: () => void;
  onClose: () => void;
};

const GAP = 10;

/**
 * Known gap §5: the prototype positioned this with raw arithmetic on
 * getBoundingClientRect() and misplaced it near the viewport edges. Measure
 * the card once it is laid out, then clamp on both axes.
 */
export function PhraseCard({ anchor, source, translation, saved, onSave, onClose }: Props) {
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
    // Re-measure when the translation lands and the card grows.
  }, [anchor, translation]);

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
      <div className="out">{translation ?? '···'}</div>
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
