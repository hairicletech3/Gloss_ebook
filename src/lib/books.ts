import { supabase, BOOKS_BUCKET } from './supabase';
import { extract } from './import';
import { saveShelf, loadShelf, saveBook, loadBook, dropBook, withTimeout } from './offlineStore';
import type { Book, BookMeta } from './types';

const META =
  'id,user_id,title,source_lang,storage_path,cover_path,page_count,last_page,created_at';

/**
 * The shelf, falling back to the local mirror when the request fails.
 *
 * The fallback is keyed off the request failing rather than off
 * `navigator.onLine`, which cheerfully reports "online" on a captive portal
 * or a dead uplink.
 */
export async function listBooks(): Promise<BookMeta[]> {
  try {
    const { data, error } = await withTimeout(
      supabase.from('books').select(META).order('created_at', { ascending: false }),
    );
    if (error) throw error;
    const books = (data ?? []) as unknown as BookMeta[];
    void saveShelf(books);
    return books;
  } catch (e) {
    const cached = await loadShelf();
    if (cached) return cached;
    throw e;
  }
}

/**
 * A book with its page text. Cached on the way through, which is what makes
 * a book readable offline once it has been opened online at least once.
 */
export async function getBook(id: string): Promise<Book> {
  try {
    const { data, error } = await withTimeout(
      supabase.from('books').select('*').eq('id', id).single(),
    );
    if (error) throw error;
    const book = data as Book;
    void saveBook(book);
    return book;
  } catch (e) {
    const cached = await loadBook(id);
    if (cached) return cached;
    throw e;
  }
}

/**
 * Extract client-side, put the original bytes in the private bucket, then
 * write the row. No file bytes ever round-trip through a function.
 */
export async function importBook(
  file: File,
  userId: string,
  sourceLang: string,
  onProgress?: (msg: string) => void,
): Promise<BookMeta> {
  const { pages } = await extract(file, onProgress);

  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\- ]+/g, '_');
  const storagePath = `${userId}/${id}/${safeName}`;

  onProgress?.('Storing the file …');
  const up = await supabase.storage.from(BOOKS_BUCKET).upload(storagePath, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (up.error) throw up.error;

  const row = {
    id,
    user_id: userId,
    title: file.name.replace(/\.[^.]+$/, ''),
    source_lang: sourceLang === 'auto' ? null : sourceLang,
    storage_path: storagePath,
    pages,
    page_count: pages.length,
    last_page: 0,
  };

  const { data, error } = await supabase.from('books').insert(row).select(META).single();
  if (error) {
    // Don't leave the uploaded file orphaned in the bucket.
    await supabase.storage.from(BOOKS_BUCKET).remove([storagePath]);
    throw error;
  }
  return data as unknown as BookMeta;
}

export async function saveLastPage(bookId: string, page: number): Promise<void> {
  const { error } = await supabase.from('books').update({ last_page: page }).eq('id', bookId);
  if (error) console.error('could not save reading position', error);
}

export async function deleteBook(book: BookMeta): Promise<void> {
  // The cover lives in the same bucket and has no row of its own to cascade
  // from, so it has to be named here or it outlives the book.
  const files = [book.storage_path, book.cover_path].filter((p): p is string => Boolean(p));
  await supabase.storage.from(BOOKS_BUCKET).remove(files);
  const { error } = await supabase.from('books').delete().eq('id', book.id);
  if (error) throw error;
  // Otherwise a deleted book stays readable offline forever.
  void dropBook(book.id);
}
