import type { BookMeta } from '../lib/types';

type Props = {
  books: BookMeta[];
  loading: boolean;
  onOpen: (book: BookMeta) => void;
  onDelete: (book: BookMeta) => void;
  onImport: () => void;
  importing: boolean;
  status: string;
};

export function Shelf({ books, loading, onOpen, onDelete, onImport, importing, status }: Props) {
  return (
    <div className="empty">
      <div className="glyph">Aa</div>
      <h2>
        Bring in a PDF, EPUB or text file. Click any word and its translation is written in above
        the line — the way a scribe would gloss a manuscript.
      </h2>
      <div className="row">
        <button className="chip solid" onClick={onImport} disabled={importing}>
          {importing ? 'Importing …' : 'Choose a file'}
        </button>
      </div>
      <div className="hint">{status || 'or drop a file anywhere on this sheet'}</div>

      {!loading && books.length > 0 && (
        <div className="shelf">
          <h3>On the shelf</h3>
          {books.map((b) => (
            <div className="shelf-row" key={b.id}>
              <button className="shelf-open" onClick={() => onOpen(b)} title={b.title}>
                {b.title}
              </button>
              <span className="shelf-meta">
                {b.last_page > 0
                  ? `p. ${b.last_page + 1} / ${b.page_count}`
                  : `${b.page_count} pages`}
              </span>
              <button
                className="shelf-del"
                title="Delete this book"
                aria-label={`Delete ${b.title}`}
                onClick={() => onDelete(b)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
