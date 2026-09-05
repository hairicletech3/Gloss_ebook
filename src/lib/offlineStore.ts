import type { Book, BookMeta, Highlight, Word } from './types';

/**
 * A local mirror of what you need in order to read without a connection.
 *
 * Deliberately small: reading never fetches the uploaded PDF — the text was
 * extracted at import and lives in `books.pages` — so nothing here caches
 * file bytes. The shelf listing is kept for every book; the (much larger)
 * page text only for books actually opened.
 */

const DB_NAME = 'gloss-offline';
const DB_VERSION = 1;

/**
 * A Supabase query made with no connection does not reject — it hangs. So
 * "fall back when the request fails" is not enough on its own: without a
 * timeout the await never returns, the catch never runs, and the library sits
 * empty forever with the cached copy sitting right there unread.
 *
 * `navigator.onLine === false` is trustworthy (there is no interface at all),
 * while `true` is not — a captive portal still reports online. So a declared
 * offline gets a short fuse, and everything else gets a patient one that
 * still ends in the cache rather than hanging.
 */
const TIMEOUT_OFFLINE = 1200;
const TIMEOUT_ONLINE = 8000;

export function withTimeout<T>(work: PromiseLike<T>, ms?: number): Promise<T> {
  const limit =
    ms ?? (typeof navigator !== 'undefined' && !navigator.onLine ? TIMEOUT_OFFLINE : TIMEOUT_ONLINE);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Network timed out')), limit);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const SHELF = 'shelf'; // BookMeta[], one row per user
const BOOKS = 'books'; // full Book, keyed by id — only for books opened
const MARGIN = 'margin'; // words + highlights, keyed by book id

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SHELF)) db.createObjectStore(SHELF);
      if (!db.objectStoreNames.contains(BOOKS)) db.createObjectStore(BOOKS);
      if (!db.objectStoreNames.contains(MARGIN)) db.createObjectStore(MARGIN);
    };
    req.onsuccess = () => resolve(req.result);
    // Private browsing, disabled storage, a blocked upgrade: the app still
    // works online, it just won't have anything to fall back on.
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(store, mode);
          const req = run(t.objectStore(store));
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

/* ── the shelf ─────────────────────────────────────────────────── */

export const saveShelf = (books: BookMeta[]) =>
  tx(SHELF, 'readwrite', (s) => s.put(books, 'all'));

export const loadShelf = () => tx<BookMeta[]>(SHELF, 'readonly', (s) => s.get('all'));

/* ── an opened book ────────────────────────────────────────────── */

export const saveBook = (book: Book) => tx(BOOKS, 'readwrite', (s) => s.put(book, book.id));

export const loadBook = (id: string) => tx<Book>(BOOKS, 'readonly', (s) => s.get(id));

export const dropBook = (id: string) =>
  Promise.all([
    tx(BOOKS, 'readwrite', (s) => s.delete(id)),
    tx(MARGIN, 'readwrite', (s) => s.delete(`hl:${id}`)),
  ]);

/* ── what you've collected ─────────────────────────────────────── */
/* Words are fetched for the whole account at once and highlights per book,
   so they're keyed the same way here rather than forced into one shape. */

export const saveWords = (words: Word[]) =>
  tx(MARGIN, 'readwrite', (s) => s.put(words, 'words:all'));

export const loadWords = () => tx<Word[]>(MARGIN, 'readonly', (s) => s.get('words:all'));

export const saveHighlights = (bookId: string, highlights: Highlight[]) =>
  tx(MARGIN, 'readwrite', (s) => s.put(highlights, `hl:${bookId}`));

export const loadHighlights = (bookId: string) =>
  tx<Highlight[]>(MARGIN, 'readonly', (s) => s.get(`hl:${bookId}`));

/**
 * Asks the browser not to evict this data under storage pressure. Best
 * effort — Chrome grants it silently on engaged sites, Safari mostly won't,
 * and nothing here depends on the answer.
 */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
}

/** Signing out must not leave the previous account's books on the device. */
export async function clearOfflineData(): Promise<void> {
  const db = await open();
  if (!db) return;
  for (const store of [SHELF, BOOKS, MARGIN]) {
    await tx(store, 'readwrite', (s) => s.clear());
  }
}
