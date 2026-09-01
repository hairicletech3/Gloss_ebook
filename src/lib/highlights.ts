import { supabase } from './supabase';
import type { Highlight, HighlightColor } from './types';

/**
 * The palette. Named rather than raw CSS so the stored value stays meaningful
 * if the shades are ever retuned — the actual colours live in app.css under
 * `.hl-<name>`, and the DB has a CHECK constraint on these same four names.
 */
export const HIGHLIGHT_COLORS: { id: HighlightColor; label: string }[] = [
  { id: 'yellow', label: 'Yellow' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'pink', label: 'Pink' },
];

export async function listHighlights(bookId: string): Promise<Highlight[]> {
  const { data, error } = await supabase
    .from('highlights')
    .select('*')
    .eq('book_id', bookId)
    .order('page', { ascending: true })
    .order('para_index', { ascending: true })
    .order('start_off', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Highlight[];
}

export type NewHighlight = {
  book_id: string;
  page: number;
  para_index: number;
  start_off: number;
  end_off: number;
  text: string;
  note: string | null;
  color: HighlightColor;
};

export async function saveHighlight(
  row: NewHighlight,
  userId: string,
): Promise<Highlight> {
  const { data, error } = await supabase
    .from('highlights')
    .insert({ ...row, user_id: userId })
    .select('*')
    .single();
  if (error) throw error;
  return data as Highlight;
}

export async function updateHighlightNote(id: string, note: string | null): Promise<void> {
  const { error } = await supabase.from('highlights').update({ note }).eq('id', id);
  if (error) throw error;
}

export async function deleteHighlight(id: string): Promise<void> {
  const { error } = await supabase.from('highlights').delete().eq('id', id);
  if (error) throw error;
}
