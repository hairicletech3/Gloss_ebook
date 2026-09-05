import { createClient } from '@supabase/supabase-js';

/**
 * The project this app talks to.
 *
 * These live in the source rather than in an env file because Vercel — and
 * most hosts like it — ignore `.env*` files committed to a repository and
 * inject only the variables configured on the project. Keeping them here is
 * what makes `git push` enough to deploy anywhere, with no per-host dashboard
 * step to remember or to get wrong.
 *
 * Publishing them costs nothing: Vite compiles every VITE_ variable into the
 * bundle anyway, so both values are already readable in devtools on any
 * deployed build. The anon key is public by design — row level security
 * (`user_id = auth.uid()`) is what actually protects the data, not secrecy.
 *
 * The line that matters: the service-role key and DATABASE_URL bypass RLS
 * entirely and must never appear here, or in any VITE_ variable. They stay in
 * .env.local, gitignored, used only by `prisma migrate` on your own machine.
 */
const PUBLIC_URL = 'https://wmwheuoaiongyqcwppgc.supabase.co';
const PUBLIC_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtd2hldW9haW9uZ3lxY3dwcGdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0OTc1NDMsImV4cCI6MjEwMzA3MzU0M30.qTZYgLdXTnBEa3OKKIEMd3x7lyiPVRB_XKQPYeH3iN0';

// An env var still wins, so a fork or a second environment can point somewhere
// else without touching this file.
const url = import.meta.env.VITE_SUPABASE_URL || PUBLIC_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || PUBLIC_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const BOOKS_BUCKET = 'books';
