type Props = {
  title: string;
  page: number;
  pageCount: number;
  /** Which screen-fit chunk of the current stored page is showing — see useScreenChunks. */
  chunkIndex: number;
  chunkCount: number;
};

export function Pager({ title, page, pageCount, chunkIndex, chunkCount }: Props) {
  const has = pageCount > 0;
  const progress = has ? ((page + (chunkIndex + 1) / Math.max(1, chunkCount)) / pageCount) * 100 : 0;

  return (
    <div className="pager">
      <span className="doctitle">{title || 'No book open'}</span>
      <span>{has ? `${page + 1} / ${pageCount}` : '—'}</span>
      <span className="track">
        <i style={{ width: has ? `${progress}%` : 0 }} />
      </span>
    </div>
  );
}
