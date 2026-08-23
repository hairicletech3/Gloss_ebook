-- Gloss — schema, RLS, and the private books bucket.

create extension if not exists pgcrypto;

-- ── books ────────────────────────────────────────────────────────────
create table if not exists books (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  title        text not null,
  source_lang  text,
  storage_path text not null,          -- path in the private bucket
  pages        jsonb not null,         -- string[], the extracted text
  page_count   int  not null,
  last_page    int  not null default 0, -- resume position
  created_at   timestamptz default now()
);
create index if not exists books_user on books (user_id, created_at desc);

-- ── words ────────────────────────────────────────────────────────────
create table if not exists words (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  book_id     uuid references books on delete cascade,
  term        text not null,
  lemma       text,                    -- see spec §7; unused in v1
  translation text not null,
  context     text,                    -- the sentence it was found in
  page        int,
  kind        text not null default 'word' check (kind in ('word','phrase')),
  -- SM-2 review state (v2)
  ease        real not null default 2.5,
  interval    int  not null default 0,  -- days
  reps        int  not null default 0,
  due_at      timestamptz not null default now(),
  created_at  timestamptz default now()
);
create unique index if not exists words_unique on words (user_id, lower(term), book_id);
create index if not exists words_due on words (user_id, due_at);

-- ── the translation cache. do not skip this. ─────────────────────────
create table if not exists translations (
  hash        text primary key,        -- sha256(from|to|mode|lower(text))
  source_lang text,
  target_lang text,
  source_text text not null,
  translation text not null,
  hits        int default 1,
  created_at  timestamptz default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────
alter table books enable row level security;
alter table words enable row level security;
alter table translations enable row level security;

drop policy if exists books_own on books;
create policy books_own on books
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists words_own on words;
create policy words_own on words
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Shared cache: no user data in it. Readable by any signed-in user; only the
-- Edge Function writes, and it does so with the service role key (which
-- bypasses RLS), so no insert/update policy is granted here.
drop policy if exists translations_read on translations;
create policy translations_read on translations
  for select to authenticated
  using (true);

-- Counting cache hits without a read-then-write race.
create or replace function bump_translation_hits(h text)
returns void
language sql
security definer
set search_path = public
as $$
  update translations set hits = hits + 1 where hash = h;
$$;

-- ── storage: the private books bucket ────────────────────────────────
insert into storage.buckets (id, name, public)
values ('books', 'books', false)
on conflict (id) do nothing;

-- Files live at {user_id}/{book_id}/{filename}, so the first path segment is
-- the owner.
drop policy if exists books_bucket_own on storage.objects;
create policy books_bucket_own on storage.objects
  for all to authenticated
  using (
    bucket_id = 'books'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'books'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
