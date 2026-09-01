import { useLayoutEffect, useRef, useState } from 'react';

type Props = { anchor: DOMRect; note: string };

const GAP = 8;

/**
 * Read-only preview of a note, shown while hovering its marker in the page.
 * Rendered at the app root rather than inside the sheet, because the sheet
 * clips overflow (it pages instead of scrolling) and would cut off any note
 * anchored near an edge. Click-through by design — clicking the marker is
 * meant to reach NoteCard underneath.
 */
export function NotePeek({ anchor, note }: Props) {
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

    // Above the marker, flipping below when there isn't room up there.
    let top = anchor.top - height - GAP;
    if (top < GAP) top = anchor.bottom + GAP;
    top = Math.min(Math.max(GAP, top), Math.max(GAP, vh - height - GAP));

    setPos({ left, top });
  }, [anchor, note]);

  return (
    <div
      ref={ref}
      className="card notepeek"
      role="tooltip"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {note}
    </div>
  );
}
