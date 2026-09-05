import type { BookMeta } from '../lib/types';

type Props = {
  books: BookMeta[];
  loading: boolean;
  onOpen: (book: BookMeta) => void;
  onImport: () => void;
  importing: boolean;
  status: string;
  /** cover_path → signed URL. Private bucket, so paths aren't linkable. */
  coverUrls: Map<string, string>;
  /** Opens the per-book menu, anchored to the button that was clicked. */
  onMenu: (book: BookMeta, anchor: DOMRect) => void;
  /** Book whose cover is mid-upload. */
  coverBusyId: string | null;
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

function BookCard({
  book,
  coverUrl,
  busy,
  onOpen,
  onMenu,
}: {
  book: BookMeta;
  coverUrl: string | undefined;
  busy: boolean;
  onOpen: () => void;
  onMenu: (anchor: DOMRect) => void;
}) {
  const tile = coverFor(book.title);
  const progress = book.page_count > 0 ? Math.min(1, (book.last_page + 1) / book.page_count) : 0;
  const hasCover = Boolean(book.cover_path && coverUrl);

  return (
    <div className="book-card">
      <button
        className={'book-cover' + (hasCover ? ' has-image' : '')}
        style={hasCover ? undefined : { background: tile.bg, color: tile.fg }}
        onClick={onOpen}
        title={book.title}
      >
        {hasCover ? (
          <img src={coverUrl} alt="" className="book-cover-img" />
        ) : (
          <span className="book-cover-glyph">{initial(book.title)}</span>
        )}
        {/* Kept above the artwork: on a real cover these are the only two
            things the tile itself can't tell you. */}
        {book.source_lang && <span className="book-cover-lang">{book.source_lang}</span>}
        {progress > 0 && (
          <span className="book-cover-progress">
            <span style={{ width: `${progress * 100}%` }} />
          </span>
        )}
        {busy && <span className="book-cover-busy">Uploading …</span>}
      </button>

      <button
        className="book-act"
        title={`More for ${book.title}`}
        aria-label={`More options for ${book.title}`}
        aria-haspopup="menu"
        disabled={busy}
        onClick={(e) => onMenu(e.currentTarget.getBoundingClientRect())}
      >
        ⋯
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

export function Shelf({
  books,
  loading,
  onOpen,
  onImport,
  importing,
  status,
  coverUrls,
  onMenu,
  coverBusyId,
}: Props) {
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
            <BookCard
              key={b.id}
              book={b}
              coverUrl={b.cover_path ? coverUrls.get(b.cover_path) : undefined}
              busy={coverBusyId === b.id}
              onOpen={() => onOpen(b)}
              onMenu={(anchor) => onMenu(b, anchor)}
            />
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
