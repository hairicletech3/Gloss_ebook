import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type BookMenuAction = 'cover' | 'remove-cover' | 'delete';

type Props = {
  anchor: DOMRect;
  hasCover: boolean;
  onAction: (a: BookMenuAction) => void;
  onClose: () => void;
};

const GAP = 6;

/**
 * The per-book menu. Rendered at the app root rather than inside the card:
 * `.sheet` sets a perspective for the page-turn, which makes it a containing
 * block for fixed-position descendants *and* clips them, so a menu opened
 * from a card near the bottom of the shelf would be cut in half.
 */
export function BookMenu({ anchor, hasCover, onAction, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Hangs off the button's right edge, flipping to the left and upward
    // when it would leave the viewport.
    let left = anchor.right - width;
    left = Math.min(Math.max(GAP, left), Math.max(GAP, vw - width - GAP));

    let top = anchor.bottom + GAP;
    if (top + height > vh - GAP) top = anchor.top - height - GAP;
    top = Math.min(Math.max(GAP, top), Math.max(GAP, vh - height - GAP));

    setPos({ left, top });
  }, [anchor, hasCover]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest('.bookmenu')) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="bookmenu"
      role="menu"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      <button role="menuitem" onClick={() => onAction('cover')}>
        {hasCover ? 'Change cover…' : 'Add a cover…'}
      </button>
      {hasCover && (
        <button role="menuitem" onClick={() => onAction('remove-cover')}>
          Remove cover
        </button>
      )}
      <div className="bookmenu-rule" />
      <button role="menuitem" className="danger" onClick={() => onAction('delete')}>
        Delete book…
      </button>
    </div>
  );
}
