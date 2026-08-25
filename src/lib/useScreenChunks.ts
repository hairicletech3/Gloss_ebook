import { useLayoutEffect, useRef, useState } from 'react';

export type Chunk = { start: number; end: number; fits: boolean };

const FULL = (n: number): Chunk[] => [{ start: 0, end: n, fits: true }];

/**
 * Splits a stored page's paragraphs into groups that actually fit the
 * visible reading area, measured against a hidden probe rather than
 * paginate.ts's fixed character budget — so a page reads like a fixed sheet
 * instead of a scrolling one. `fits: false` marks the rare chunk that is a
 * single paragraph too tall for the area on its own; the caller can let
 * just that one scroll instead of silently clipping it.
 */
export function useScreenChunks(
  paragraphs: string[],
  containerRef: React.RefObject<HTMLElement | null>,
): Chunk[] {
  const [chunks, setChunks] = useState<Chunk[]>(() => FULL(paragraphs.length));
  const paragraphsRef = useRef(paragraphs);
  paragraphsRef.current = paragraphs;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Appended to <body>, never inside `container` — that div is also
    // managed by React (Page remounts on every chunk turn), and React has
    // no idea this node exists. Sharing a parent with it risks the two
    // reconcilers fighting over child order. The `.text` class alone is
    // enough to inherit the right font/line-height/measure via CSS; DOM
    // position was never what supplied that.
    const probe = document.createElement('div');
    probe.className = 'text';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.top = '0';
    probe.style.left = '0';
    probe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(probe);

    function measure() {
      const paras = paragraphsRef.current;
      if (!paras.length) {
        setChunks(FULL(0));
        return;
      }
      const cs = getComputedStyle(container!);
      const padLeft = parseFloat(cs.paddingLeft) || 0;
      const padRight = parseFloat(cs.paddingRight) || 0;
      const padTop = parseFloat(cs.paddingTop) || 0;
      const padBottom = parseFloat(cs.paddingBottom) || 0;
      const contentWidth = container!.clientWidth - padLeft - padRight;
      const budget = container!.clientHeight - padTop - padBottom;
      if (contentWidth <= 0 || budget <= 0) return;

      probe.style.width = contentWidth + 'px';
      probe.innerHTML = '';

      const next: Chunk[] = [];
      let start = 0;
      let i = 0;
      while (i < paras.length) {
        const p = document.createElement('p');
        p.textContent = paras[i];
        probe.appendChild(p);
        const fits = probe.scrollHeight <= budget;

        if (fits) {
          i++;
          continue;
        }
        if (i > start) {
          // this paragraph is the one that overflowed — close the chunk
          // before it and retry it as the start of the next one.
          probe.innerHTML = '';
          next.push({ start, end: i, fits: true });
          start = i;
          continue;
        }
        // a lone paragraph taller than the whole page — keep it anyway,
        // flagged so that one chunk can fall back to scrolling.
        probe.innerHTML = '';
        next.push({ start, end: i + 1, fits: false });
        start = i + 1;
        i++;
      }
      if (start < paras.length) next.push({ start, end: paras.length, fits: true });
      setChunks(next.length ? next : FULL(paras.length));
    }

    let raf = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    measure();
    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.body.removeChild(probe);
    };
  }, [paragraphs]);

  return chunks;
}
