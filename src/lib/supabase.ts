import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Only the URL and the anon key ever reach the browser. The translation
 * provider's key lives in Edge Function secrets and never leaves the server —
 * see supabase/functions/translate.
 */
export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'public-anon-key-not-set',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export const BOOKS_BUCKET = 'books';
