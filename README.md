# Gloss

A personal reader for books in a foreign language. Import a PDF or EPUB you
already own, click any word, and its translation is written **above the line** —
the way a scribe glosses a manuscript — instead of appearing in a popup that
covers the text. Words you keep go into a margin panel.

Built from [`GLOSS-SPEC.md`](./GLOSS-SPEC.md). The original single-file
prototype is kept at [`gloss-reader-demo.html`](./gloss-reader-demo.html) as the
reference for the visual design and interaction model.

## Setup

### 1. Install

```bash
npm install
```

### 2. Env

```bash
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (dashboard → Project
Settings → API) and `DIRECT_URL` (dashboard → Connect → ORMs). Both Vite and
Prisma read this one file.

Only `VITE_`-prefixed vars are compiled into the browser bundle, which is why
`DIRECT_URL` — your database password — is safe to keep alongside them.

### 3. Schema

Prisma owns the schema and generates the migrations:

```bash
npm run db:deploy     # apply prisma/migrations to the database
npm run db:status     # check what is applied
```

That creates `books`, `words` and the `translations` cache, turns on RLS (every
policy is `user_id = auth.uid()`), adds the case-insensitive uniqueness index,
the hit counter function, and the private `books` storage bucket with
owner-scoped policies.

Then enable **Email** auth (magic link) in Authentication → Providers, and add
your dev and production URLs to the redirect allow-list.

### 4. The translate function

**The provider API key lives in Edge Function secrets. It is never in client
code, never in a `VITE_*` var, never in the repo.**

```bash
supabase functions deploy translate
supabase secrets set AZURE_TRANSLATOR_KEY=... AZURE_TRANSLATOR_REGION=southeastasia
```

Optional secrets: `TRANSLATE_PROVIDER` (`azure` default, or `anthropic`),
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AZURE_TRANSLATOR_ENDPOINT`,
`RATE_LIMIT_PER_MIN` (default 60), `ALLOWED_ORIGIN`.

### 5. Run

```bash
npm run dev
```

## Prisma's role

Prisma is a **schema and migration tool here, not a data layer.** It runs from
your machine, connects as the database owner, and creates tables. The app never
uses it.

That split is deliberate. Prisma cannot run in a browser, and it has no
`auth.uid()` — the JWT claim every RLS policy is written against. If the app
queried through Prisma it would bypass RLS entirely and every authorization
check would have to be re-implemented by hand. So the runtime path stays
supabase-js → PostgREST → RLS, and Prisma is only ever pointed at the database
by you.

`prisma/schema.prisma` owns the three tables. It cannot express RLS policies,
the `lower(term)` unique index, the `auth.users` foreign keys, the
`bump_translation_hits` function, or the storage bucket — so those are
hand-written SQL below a banner in
[`prisma/migrations/20260823000000_init/migration.sql`](./prisma/migrations/20260823000000_init/migration.sql).
**If you change a table, regenerate the top half of that file and keep the
bottom half:**

```bash
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
```

Note for anyone following Supabase's Prisma docs: they target Prisma 6. On
Prisma 7 (used here) `url`/`directUrl` are rejected in `schema.prisma` and live
in `prisma.config.ts` instead, and dotenv is no longer auto-loaded — the config
file loads `.env.local` explicitly.

## How it works

**Import** is entirely client-side — `pdfjs-dist` and `epubjs` run in the
browser, so no book bytes round-trip through a function. The extracted
`string[]` goes in the `books` row; the original file goes to
`books/{user_id}/{book_id}/{filename}` in the private bucket. A PDF with no text
layer is detected and reported plainly rather than failing silently. Both
readers are dynamically imported so they stay out of the first paint.

**The gloss** is the whole point. Every word is a `<span class="w">`; the
translation lands in `data-gloss` and CSS draws it via `::before` into the space
the `2.05` line-height already reserves. Verified in-browser: paragraph offsets
and heights are byte-identical before and after glossing, so the page never
reflows.

**Translation** goes through the `translate` Edge Function, which verifies the
caller's JWT, hashes `(from, to, mode, lower(text))`, and returns from the
shared `translations` cache on a hit. Only misses reach the provider, and only
misses count against the rate limit. Word mode asks for the sense used in the
surrounding sentence, capped short enough to sit above the line; phrase mode
gets a normal natural translation. Everything provider-specific is behind
`callProvider()` in one file.

**The margin** keeps term, translation, and the sentence the word came from.
Click a term to jump to its page. Export CSV (Anki-importable) or JSON. A word
you kept shows its gloss in gold again next time you open the book, without
paying for another lookup.

## The four known gaps from spec §5

All four are closed:

- **Long glosses** are clamped with `max-width` + ellipsis and reveal in full on
  hover or keyboard focus.
- **Keyboard glossing** works — words are tabbable, Enter or Space glosses the
  focused word, `S` keeps it.
- **The tokenizer** uses `Intl.Segmenter` with `granularity: 'word'`, so
  Japanese, Chinese, Thai and Khmer segment correctly instead of collapsing into
  one giant "word". Phrase-vs-word selection is decided by counting word-like
  segments, not by looking for whitespace.
- **The phrase card** measures itself after layout and clamps on both axes.
  Verified against all four viewport corners.

## Keys

| Key | |
|---|---|
| `←` `→` | turn the page |
| `Enter` / `Space` | gloss the focused word |
| `S` | keep the last glossed word in the margin |
| `Esc` | dismiss the phrase card |

## Not built

Review mode (spec §7) is deliberately absent. Per the spec: build the reading
loop first, collect a few hundred words from real reading, then build the study
loop. The `words` table already carries the SM-2 columns (`ease`, `interval`,
`reps`, `due_at`) so the queue is ready when it is time.
