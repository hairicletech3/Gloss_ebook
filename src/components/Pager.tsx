type Props = {
  title: string;
  page: number;
  pageCount: number;
  /** Which screen-fit chunk of the current stored page is showing — see useScreenChunks. */
  chunkIndex: number;
  chunkCount: number;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
};

/**
 * The page turn used to be arrow keys and a swipe, neither of which announces
 * itself: on a phone or an iPad there is no keyboard to hint at it and no way
 * to discover the swipe except by accident. These two buttons are that
 * affordance made visible — the keys and the swipe still work alongside them.
 */
export function Pager({
  title,
  page,
  pageCount,
  chunkIndex,
  chunkCount,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: Props) {
  const has = pageCount > 0;
  const progress = has ? ((page + (chunkIndex + 1) / Math.max(1, chunkCount)) / pageCount) * 100 : 0;

  return (
    <div className="pager">
      <button
        className="turn"
        onClick={onPrev}
        disabled={!canPrev}
        title="Previous page"
        aria-label="Previous page"
      >
        ‹
      </button>
      <span className="doctitle">{title || 'No book open'}</span>
      <span className="pageno">{has ? `${page + 1} / ${pageCount}` : '—'}</span>
      <span className="track">
        <i style={{ width: has ? `${progress}%` : 0 }} />
      </span>
      <button
        className="turn"
        onClick={onNext}
        disabled={!canNext}
        title="Next page"
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}
