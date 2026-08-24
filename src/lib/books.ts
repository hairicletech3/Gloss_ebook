import { supabase, BOOKS_BUCKET } from './supabase';
import { extract } from './import';
import type { Book, BookMeta } from './types';

const META =
  'id,user_id,title,source_lang,storage_path,page_count,last_page,created_at';

export async function listBooks(): Promise<BookMeta[]> {
  const { data, error } = await supabase
    .from('books')
    .select(META)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as BookMeta[];
}

export async function getBook(id: string): Promise<Book> {
  const { data, error } = await supabase.from('books').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Book;
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
  await supabase.storage.from(BOOKS_BUCKET).remove([book.storage_path]);
  const { error } = await supabase.from('books').delete().eq('id', book.id);
  if (error) throw error;
}
