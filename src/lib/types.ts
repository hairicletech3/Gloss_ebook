export type Book = {
  id: string;
  user_id: string;
  title: string;
  source_lang: string | null;
  storage_path: string;
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
