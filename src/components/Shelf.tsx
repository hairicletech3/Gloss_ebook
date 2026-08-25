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

/* Cheap deterministic hash so the same title always gets the same cover,
   without storing a color anywhere. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const COVERS = [
  { bg: 'var(--lapis)', fg: 'var(--page)' },
  { bg: 'var(--gold)', fg: 'var(--page)' },
  { bg: 'var(--ink)', fg: 'var(--page)' },
  { bg: 'var(--lapis-wash)', fg: 'var(--lapis)' },
  { bg: 'var(--gold-wash)', fg: 'var(--gold)' },
];

function coverFor(title: string) {
  return COVERS[hash(title) % COVERS.length];
}

function initial(title: string) {
  return title.trim().charAt(0).toUpperCase() || '?';
}

function BookCard({ book, onOpen, onDelete }: { book: BookMeta; onOpen: () => void; onDelete: () => void }) {
  const cover = coverFor(book.title);
  const progress = book.page_count > 0 ? Math.min(1, (book.last_page + 1) / book.page_count) : 0;

  return (
    <div className="book-card">
      <button
        className="book-cover"
        style={{ background: cover.bg, color: cover.fg }}
        onClick={onOpen}
        title={book.title}
      >
        <span className="book-cover-glyph">{initial(book.title)}</span>
        {book.source_lang && <span className="book-cover-lang">{book.source_lang}</span>}
        {progress > 0 && (
          <span className="book-cover-progress">
            <span style={{ width: `${progress * 100}%` }} />
          </span>
        )}
      </button>
      <button
        className="book-del"
        title="Delete this book"
        aria-label={`Delete ${book.title}`}
        onClick={onDelete}
      >
        ×
      </button>
      <button className="book-title" onClick={onOpen} title={book.title}>
        {book.title}
      </button>
      <span className="book-meta">
        {book.last_page > 0 ? `p. ${book.last_page + 1} / ${book.page_count}` : `${book.page_count} pages`}
      </span>
    </div>
  );
}

export function Shelf({ books, loading, onOpen, onDelete, onImport, importing, status }: Props) {
  const hasBooks = !loading && books.length > 0;

  return (
    <div className="library">
      <div className="library-head">
        <h2>
          Library<span className="count">{books.length}</span>
        </h2>
        <button className="chip solid" onClick={onImport} disabled={importing}>
          {importing ? 'Importing …' : 'Import a book'}
        </button>
      </div>

      {hasBooks ? (
        <div className="library-grid">
          {books.map((b) => (
            <BookCard key={b.id} book={b} onOpen={() => onOpen(b)} onDelete={() => onDelete(b)} />
          ))}
        </div>
      ) : (
        <div className="library-empty">
          <div className="ghost-shelf">
            <span className="ghost-cover" />
            <button className="ghost-cover ghost-add" onClick={onImport} aria-label="Import a book">
              +
            </button>
            <span className="ghost-cover" />
          </div>
          <p>Bring in a PDF, EPUB or text file to start your first book.</p>
        </div>
      )}

      <div className="hint">{status || 'or drop a file anywhere on this sheet'}</div>
    </div>
  );
}
