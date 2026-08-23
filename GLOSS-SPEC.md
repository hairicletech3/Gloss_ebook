# Gloss — build spec

A personal reader for books in a foreign language. Import a PDF or EPUB you already own, click any word, and its translation is written **above the line** — the way a scribe glosses a manuscript — instead of appearing in a popup that covers the text. Words you keep go into a margin panel and come back later as spaced-repetition review.

Single user (me). Not a product. Optimise for reading quality and low running cost, not for scale.

There is a working single-file prototype at `gloss-reader-demo.html`. **Read it before starting.** It is the source of truth for the visual design, the interaction model, and the tokenizer. This spec describes how to turn it into a real app.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + TypeScript | Prototype is vanilla; port it |
| Styling | Plain CSS with the token set below | No framework. The design is specific; utility classes will fight it |
| Auth | Supabase Auth, email magic link | Single user, but RLS needs a `user_id` |
| DB | Supabase Postgres | |
| Files | Supabase Storage, private bucket | Never put book bytes in a table |
| Translation | Supabase Edge Function → provider API | **The API key must never reach the browser** |
| Hosting | Vercel or Netlify free tier | |

No server beyond Supabase. No queue, no Redis, no ORM.

---

## 2. Data model

```sql
create table books (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  title       text not null,
  source_lang text,
  storage_path text not null,          -- path in the private bucket
  pages       jsonb not null,          -- string[], the extracted text
  page_count  int  not null,
  last_page   int  not null default 0, -- resume position
  created_at  timestamptz default now()
);

create table words (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  book_id     uuid references books on delete cascade,
  term        text not null,
  lemma       text,                    -- see §7
  translation text not null,
  context     text,                    -- the sentence it was found in
  page        int,
  kind        text not null default 'word',   -- 'word' | 'phrase'
  -- SM-2 review state
  ease        real not null default 2.5,
  interval    int  not null default 0,  -- days
  reps        int  not null default 0,
  due_at      timestamptz not null default now(),
  created_at  timestamptz default now()
);
create unique index words_unique on words (user_id, lower(term), book_id);
create index words_due on words (user_id, due_at);

create table translations (           -- the cache. do not skip this.
  hash        text primary key,        -- sha256(source_lang|target_lang|lower(text))
  source_lang text, target_lang text,
  source_text text not null,
  translation text not null,
  hits        int default 1,
  created_at  timestamptz default now()
);
```

Enable RLS on `books` and `words`; every policy is `user_id = auth.uid()`. The `translations` table is shared cache with no user data — readable by any authenticated user, writable only by the Edge Function via the service role key.

---

## 3. Translation

### The rule
The provider API key lives in Edge Function secrets. It is never in client code, never in `VITE_*` env vars, never in the repo.

### Edge Function `translate`

```
POST /functions/v1/translate
body: { text, from, to, context?, mode: 'word' | 'phrase' }
→    { translation, cached: boolean }
```

Flow:
1. Verify the caller's JWT. Reject anonymous requests.
2. Hash `(from, to, lower(text))`. `select` from `translations`. **On hit, return immediately and increment `hits`.** This is what keeps the bill at zero.
3. On miss, call the provider, insert into `translations`, return.
4. Rate-limit at ~60 uncached calls/minute per user so a runaway loop can't drain the free tier.

### Provider
Start with **Microsoft Azure Translator** — $10 per million characters and a 2M chars/month permanent free tier, the largest of the majors. Google Cloud Translation ($20/M, 500K free) and DeepL (~$25/M plus a base fee, 500K free) are the alternatives; DeepL reads best for European languages but costs the most and covers fewer languages.

Keep the provider behind one function `callProvider(text, from, to)` so switching is a single-file change.

**Cost reality check:** clicking a word sends ~8 characters. A 2M character monthly free tier is roughly 250,000 word lookups. This will not cost money at single-user volume. Cache hits make it cheaper still. Do not over-engineer around cost.

### Word mode vs phrase mode
Single words need disambiguation, not literal translation. Pass the surrounding sentence and ask for the meaning *as used here*, capped at 2–3 words so it fits above the line. Phrases get a normal natural translation. The prototype's prompts are a reasonable starting point.

If you use an LLM as the provider instead of an NMT API, demand strict JSON with no markdown fence and parse defensively — the prototype's `.replace(/```json|```/g,'')` guard exists for a reason.

---

## 4. Import pipeline

Do all extraction **client-side** — `pdfjs-dist` and `epubjs` both run in the browser, so no bytes need to round-trip through a function.

1. User drops a file.
2. Extract to `string[]` (one entry per page/chunk).
3. Upload the original to Storage at `{user_id}/{book_id}/{filename}`.
4. Insert the `books` row with the extracted `pages`.

**PDF.** Port `readPDF()` from the prototype. It reads `getTextContent()` and reconstructs line and paragraph breaks from the Y-coordinate deltas in `item.transform[5]`, joins hyphenated line-ends, and collapses runs of whitespace. It works but it is the roughest part of the codebase — expect to tune the `4` and `14` pixel thresholds against real books.

**Scanned PDFs have no text layer.** Detect this (near-zero extracted characters across several pages) and say so plainly: the file is images, run OCR first. Do not fail silently. OCR is out of scope for v1; if you want it later, `tesseract.js` runs in-browser.

**EPUB.** Port `readEPUB()`. Iterate `book.spine.spineItems`, `item.load()`, take `textContent`, `item.unload()`. Wrap each section in try/catch — malformed sections are common and one bad chapter should not kill the import.

**TXT/MD.** Straight to `paginate()`, ~2200 chars per page, split on paragraph boundaries only.

---

## 5. The reader

### The gloss (this is the whole point — get it right)

Every word is `<span class="w">`. On click, the translation lands in `data-gloss`, and CSS renders it via `::before` positioned above the word. Line-height is `2.05` so the gloss occupies space that already exists — **the page must not reflow when a gloss appears.** If clicking a word makes the paragraph jump, the feature is broken.

Glossed words keep a blue underline and wash; saved words switch to gold. A toggle strips all glosses so you can re-read clean.

### Known gaps to fix

- **Long words overflow.** `échafaudages` → a Khmer gloss wider than the word, and it collides with neighbours. Add `max-width` on the gloss with ellipsis, full text on hover or focus.
- **No keyboard path to glossing.** `.w` has `tabindex="-1"`, so words are unreachable by tab. Either make them tabbable with Enter to gloss, or add a caret-based mode. Right now this is mouse-only, which is a real accessibility failure.
- **The tokenizer assumes spaces.** `split(/(\s+)/)` produces one giant "word" for Japanese, Chinese, Thai, and Khmer. If those languages matter, segment with `Intl.Segmenter` with `granularity: 'word'` — it's built into modern browsers and handles all of them. **Do this in v1;** it is a five-line change and retrofitting it later means touching every render path.
- **Phrase card positioning** is arithmetic on `getBoundingClientRect()` and will misplace near viewport edges. Use a positioning library or clamp properly.

### Reading state
Persist `last_page` on page change, debounced. Opening a book resumes where you left off. This is a small thing that matters enormously in daily use.

---

## 6. The margin

Saved words list, newest first: term, translation, and the sentence it came from. Click the term to jump to its page. Export CSV (Anki-importable: term, translation, context, page) and JSON.

Keep the context sentence. A word without the sentence it lived in is nearly worthless for review, and it's free to store.

---

## 7. Review (v2, not v1)

Plain **SM-2**. Cards are the `words` rows; `due_at` drives the queue. Show the term, reveal translation and context, grade Again / Hard / Good / Easy, update `ease`, `interval`, `reps`, `due_at`.

Do not build a review UI until there are a few hundred words in the margin from real reading. Building the study loop before the reading loop is the standard way these projects die.

**Lemmas.** `courait`, `couru`, and `court` are three rows for one verb. If review gets noisy, ask the translation provider for the dictionary form alongside the gloss, store it in `lemma`, and dedupe review cards on it. Not needed for v1.

---

## 8. Design tokens

Taken verbatim from the prototype. Do not redesign — port.

```css
--paper:#E9E7E0;   /* app background, cool oat */
--page:#FCFBF8;    /* the reading sheet */
--ink:#1A1C21;
--ink-soft:#4A4D55;
--muted:#84878F;
--rule:#D6D3CA;
--lapis:#2A46B8;      --lapis-wash:#EAEDFA;   /* glosses */
--gold:#9A6B18;       --gold-wash:#F6EEDC;    /* saved words */
```

Type: **Bricolage Grotesque** for the wordmark and headings (sparingly), **Newsreader** for all reading text, **IBM Plex Mono** for counters, labels, and chips, **Noto Sans Khmer** for Khmer glosses. Add a Noto face for any other non-Latin target language — glosses in a fallback font look broken.

The reading column is capped at `62ch`. Body text is 19px at line-height 2.05. Both numbers are load-bearing: the measure makes long reading comfortable, and the leading is what makes room for the glosses.

Quality floor: responsive to mobile (margin becomes a bottom sheet under 900px), visible keyboard focus, `prefers-reduced-motion` respected.

---

## 9. Build order

1. Vite + React + TS scaffold, Supabase client, magic-link auth, the token CSS.
2. Import: drop → extract → Storage + `books` row. PDF and TXT first, EPUB after.
3. Reader: render pages, `Intl.Segmenter` tokenizer, pager, resume position.
4. Edge Function `translate` with the cache. Click-to-gloss wired to it.
5. Phrase selection and card.
6. Margin: save, list, delete, jump-to-page, CSV/JSON export.
7. Fix the four known gaps in §5.
8. *Then* review mode.

Ship 1–6 and read a whole book with it before writing any of 7 or 8. What's annoying in real use will not be what's on this list.

---

## 10. Out of scope

Sharing, multi-user, mobile apps, audio/TTS, a content library, OCR, PDF page-image rendering (text-only reading is the point), and any AI feature beyond translation.
