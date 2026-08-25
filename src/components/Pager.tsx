type Props = {
  title: string;
  page: number;
  pageCount: number;
  /** Which screen-fit chunk of the current stored page is showing — see useScreenChunks. */
  chunkIndex: number;
  chunkCount: number;
  onGo: (delta: number) => void;
};

export function Pager({ title, page, pageCount, chunkIndex, chunkCount, onGo }: Props) {
  const has = pageCount > 0;
  const atStart = page === 0 && chunkIndex === 0;
  const atEnd = page >= pageCount - 1 && chunkIndex >= chunkCount - 1;
  const progress = has ? ((page + (chunkIndex + 1) / Math.max(1, chunkCount)) / pageCount) * 100 : 0;

  return (
    <div className="pager">
      <span className="doctitle">{title || 'No book open'}</span>
      <button onClick={() => onGo(-1)} disabled={!has || atStart} aria-label="Previous page">
        ←
      </button>
      <span>
        {has ? `${page + 1} / ${pageCount}` : '—'}
        {has && chunkCount > 1 && (
          <span className="subpage"> · {chunkIndex + 1}/{chunkCount}</span>
        )}
      </span>
      <button onClick={() => onGo(1)} disabled={!has || atEnd} aria-label="Next page">
        →
      </button>
      <span className="track">
        <i style={{ width: has ? `${progress}%` : 0 }} />
      </span>
    </div>
  );
}
