type Props = {
  title: string;
  page: number;
  pageCount: number;
  onGo: (delta: number) => void;
};

export function Pager({ title, page, pageCount, onGo }: Props) {
  const has = pageCount > 0;
  return (
    <div className="pager">
      <span className="doctitle">{title || 'No book open'}</span>
      <button onClick={() => onGo(-1)} disabled={!has || page === 0} aria-label="Previous page">
        ←
      </button>
      <span>{has ? `${page + 1} / ${pageCount}` : '—'}</span>
      <button
        onClick={() => onGo(1)}
        disabled={!has || page >= pageCount - 1}
        aria-label="Next page"
      >
        →
      </button>
      <span className="track">
        <i style={{ width: has ? `${((page + 1) / pageCount) * 100}%` : 0 }} />
      </span>
    </div>
  );
}
