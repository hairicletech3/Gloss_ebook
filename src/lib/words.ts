import { supabase } from './supabase';
import { saveWords, loadWords, withTimeout } from './offlineStore';
import type { Word, WordKind } from './types';

export async function listWords(bookId: string | null): Promise<Word[]> {
  try {
    let q = supabase.from('words').select('*').order('created_at', { ascending: false });
    if (bookId) q = q.eq('book_id', bookId);
    const { data, error } = await withTimeout(q);
    if (error) throw error;
    const words = (data ?? []) as Word[];
    // Only the unfiltered call mirrors the whole account, so only it is
    // safe to cache under the shared key.
    if (!bookId) void saveWords(words);
    return words;
  } catch (e) {
    const cached = await loadWords();
    if (cached) return bookId ? cached.filter((w) => w.book_id === bookId) : cached;
    throw e;
  }
}

export type NewWord = {
  book_id: string | null;
  term: string;
  translation: string;
  context: string | null;
  page: number | null;
  kind: WordKind;
};

export async function saveWord(entry: NewWord, userId: string): Promise<Word> {
  const { data, error } = await supabase
    .from('words')
    .insert({ ...entry, user_id: userId })
    .select('*')
    .single();
  if (error) throw error;
  return data as Word;
}

export async function deleteWord(id: string): Promise<void> {
  const { error } = await supabase.from('words').delete().eq('id', id);
  if (error) throw error;
}
