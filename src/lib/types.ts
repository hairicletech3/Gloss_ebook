export type Book = {
  id: string;
  user_id: string;
  title: string;
  source_lang: string | null;
  storage_path: string;
  /** Cover image in the private bucket, or null for the generated tile. */
  cover_path: string | null;
  pages: string[];
  page_count: number;
  last_page: number;
  created_at: string;
};

/** A `books` row without the (large) `pages` payload — what the shelf lists. */
export type BookMeta = Omit<Book, 'pages'>;

export type WordKind = 'word' | 'phrase';

export type Word = {
  id: string;
  user_id: string;
  book_id: string | null;
  term: string;
  lemma: string | null;
  translation: string;
  context: string | null;
  page: number | null;
  kind: WordKind;
  ease: number;
  interval: number;
  reps: number;
  due_at: string;
  created_at: string;
};

export type TranslateMode = 'word' | 'phrase';

export type HighlightColor = 'yellow' | 'blue' | 'green' | 'pink';

/**
 * A marked passage. A "note" is the same row with `note` filled in — one
 * table and one selection flow covers both. Anchored by paragraph index and
 * character offsets rather than by matching the text, which is only safe
 * because a book's extracted pages are written once at import.
 */
export type Highlight = {
  id: string;
  user_id: string;
  book_id: string;
  page: number;
  para_index: number;
  start_off: number;
  end_off: number;
  text: string;
  note: string | null;
  color: HighlightColor;
  created_at: string;
};
