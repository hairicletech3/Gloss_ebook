import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase, isConfigured } from './lib/supabase';
import { importBook, listBooks, getBook, saveLastPage, deleteBook } from './lib/books';
import { listWords, saveWord, deleteWord } from './lib/words';
import { translate } from './lib/translate';
import { parsePage } from './lib/parsePage';
import { useScreenChunks } from './lib/useScreenChunks';
import { sentenceAt, tokenize } from './lib/tokenize';
import { segmenterLocale } from './lib/languages';
import type { Book, BookMeta, Word, WordKind } from './lib/types';

import { Auth } from './components/Auth';
import { TopBar } from './components/TopBar';
import { Shelf } from './components/Shelf';
import { Page } from './components/Page';
import { Pager } from './components/Pager';
import { Margin } from './components/Margin';
import { PhraseCard } from './components/PhraseCard';
import { useToast } from './components/Toast';

type LastWord = { key: string; term: string; context: string };
type Phrase = { anchor: DOMRect; source: string; translation: string | null };

const LS_SRC = 'gloss.srcLang';
const LS_TGT = 'gloss.tgtLang';
/** Stable empty-array reference — `parsed?.paragraphs ?? []` would otherwise
    hand useScreenChunks a new array every render whenever no book is open,
    which loops its measurement effect forever. */
const NO_PARAGRAPHS: string[] = [];

export default function App() {
  const { toast, node: toastNode } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  const [books, setBooks] = useState<BookMeta[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [book, setBook] = useState<Book | null>(null);
  const [page, setPage] = useState(0);
  /** Which screen-fit chunk of the stored page is showing. -1 is a sentinel
      for "the last chunk, whatever that turns out to be" — used when
      crossing backward into a page whose chunk count isn't known yet, so it
      resolves correctly once useScreenChunks finishes measuring instead of
      racing it. */
  const [chunkIndex, setChunkIndex] = useState(0);
  const [turnDir, setTurnDir] = useState<'next' | 'prev' | null>(null);

  const [words, setWords] = useState<Word[]>([]);
  const [glosses, setGlosses] = useState<Map<string, string>>(new Map());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [lastWord, setLastWord] = useState<LastWord | null>(null);
  const [phrase, setPhrase] = useState<Phrase | null>(null);

  const [srcLang, setSrcLang] = useState(() => localStorage.getItem(LS_SRC) || 'auto');
  const [tgtLang, setTgtLang] = useState(() => localStorage.getItem(LS_TGT) || 'km');
  const [glossesOn, setGlossesOn] = useState(true);
  const [marginOpen, setMarginOpen] = useState(false);

  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState('');
  const [dropping, setDropping] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const locale = segmenterLocale(srcLang);

  /* ── session ───────────────────────────────────────────────── */
  useEffect(() => {
    if (!isConfigured) {
      setBooting(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBooting(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_SRC, srcLang);
  }, [srcLang]);
  useEffect(() => {
    localStorage.setItem(LS_TGT, tgtLang);
  }, [tgtLang]);

  /* ── library + margin load ─────────────────────────────────── */
  useEffect(() => {
    if (!session) {
      setBooks([]);
      setWords([]);
      setBook(null);
      return;
    }
    let alive = true;
    setBooksLoading(true);
    listBooks()
      .then((b) => alive && setBooks(b))
      .catch((e) => alive && toast(e.message ?? 'Could not load your books'))
      .finally(() => alive && setBooksLoading(false));
    listWords(null)
      .then((w) => alive && setWords(w))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [session, toast]);

  /* ── the page currently on screen ──────────────────────────── */
  const parsed = useMemo(
    () => (book ? parsePage(book.pages[page] ?? '', page, locale) : null),
    [book, page, locale],
  );

  /* A stored page (~2200 chars) can be taller than the window, so it's
     further split into screen-fit chunks here — real pagination instead of
     letting the sheet scroll. Measurement happens in a layout effect inside
     the hook, so `chunks` can lag a render behind a page change; resolving
     the -1 sentinel here (rather than in an effect racing that measurement)
     means it's always read fresh, however many renders it takes to settle. */
  const chunks = useScreenChunks(parsed?.paragraphs ?? NO_PARAGRAPHS, sheetRef);
  const resolvedChunkIndex =
    chunkIndex < 0 ? chunks.length - 1 : Math.min(chunkIndex, chunks.length - 1);
  const currentChunk = chunks[Math.max(0, resolvedChunkIndex)] ?? {
    start: 0,
    end: parsed?.paragraphs.length ?? 0,
    fits: true,
  };

  /* Safety net for a resize shrinking the chunk count out from under a
     non-sentinel index — page-turn navigation already sets chunkIndex
     explicitly (0, -1, or a direct neighbor), so this never needs to guess
     "why" chunks changed. */
  useEffect(() => {
    setChunkIndex((ci) => (ci < 0 ? ci : Math.min(ci, Math.max(0, chunks.length - 1))));
  }, [chunks.length]);

  const bookWords = useMemo(
    () => (book ? words.filter((w) => w.book_id === book.id) : words),
    [words, book],
  );
  const savedTerms = useMemo(
    () => new Set(bookWords.map((w) => w.term.toLowerCase())),
    [bookWords],
  );

  /* A word you kept already has a translation, so re-reading the book shows
     it again in gold without paying for another lookup. Session glosses win
     over the saved one. */
  const savedByTerm = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of bookWords) {
      const k = w.term.toLowerCase();
      if (!m.has(k)) m.set(k, w.translation);
    }
    return m;
  }, [bookWords]);

  const shownGlosses = useMemo(() => {
    if (!parsed || savedByTerm.size === 0) return glosses;
    const m = new Map(glosses);
    for (const [key, ref] of parsed.words) {
      if (m.has(key)) continue;
      const saved = savedByTerm.get(ref.term.toLowerCase());
      if (saved) m.set(key, saved);
    }
    return m;
  }, [parsed, glosses, savedByTerm]);

  useEffect(() => {
    if (sheetRef.current) sheetRef.current.scrollTop = 0;
  }, [page, chunkIndex, book]);

  /* Persist the reading position, debounced. Opening a book resumes here. */
  useEffect(() => {
    if (!book || page === book.last_page) return;
    const id = book.id;
    const t = window.setTimeout(() => {
      saveLastPage(id, page);
      setBooks((bs) => bs.map((b) => (b.id === id ? { ...b, last_page: page } : b)));
    }, 700);
    return () => window.clearTimeout(t);
  }, [book, page]);

  /* ── books ─────────────────────────────────────────────────── */
  const openBook = useCallback(
    async (meta: BookMeta) => {
      try {
        const full = await getBook(meta.id);
        const startPage = Math.min(Math.max(0, full.last_page), Math.max(0, full.page_count - 1));
        setBook(full);
        setPage(startPage);
        setChunkIndex(0);
        setTurnDir(null);
        setGlosses(new Map());
        setPending(new Set());
        setLastWord(null);
        setPhrase(null);
        if (full.source_lang) setSrcLang(full.source_lang);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not open that book');
      }
    },
    [toast],
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!session) return;
      setImporting(true);
      setStatus('Reading ' + file.name + ' …');
      try {
        const meta = await importBook(file, session.user.id, srcLang, setStatus);
        setBooks((bs) => [meta, ...bs]);
        toast(`${meta.page_count} pages ready`);
        await openBook(meta);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not import that file');
      } finally {
        setImporting(false);
        setStatus('');
      }
    },
    [session, srcLang, toast, openBook],
  );

  const removeBook = useCallback(
    async (meta: BookMeta) => {
      if (!window.confirm(`Delete “${meta.title}” and everything saved from it?`)) return;
      try {
        await deleteBook(meta);
        setBooks((bs) => bs.filter((b) => b.id !== meta.id));
        setWords((ws) => ws.filter((w) => w.book_id !== meta.id));
        if (book?.id === meta.id) setBook(null);
        toast('Deleted');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not delete that book');
      }
    },
    [book, toast],
  );

  /* Turning "next"/"prev" (delta is always ±1) walks the on-screen chunks of
     the current stored page first, and only crosses into the next/previous
     stored page once you're at the edge of those — going back across that
     boundary lands on the previous page's LAST chunk, not its first, so
     "back" reads like turning back one physical page rather than jumping to
     its start. */
  const go = useCallback(
    (delta: number) => {
      if (!book || delta === 0) return;
      setPhrase(null);
      const dir = delta > 0 ? 'next' : 'prev';
      const targetChunk = resolvedChunkIndex + delta;
      if (targetChunk >= 0 && targetChunk < chunks.length) {
        setTurnDir(dir);
        setChunkIndex(targetChunk);
        return;
      }
      const nextPage =
        delta > 0 ? Math.min(page + 1, book.page_count - 1) : Math.max(page - 1, 0);
      if (nextPage === page) return;
      setTurnDir(dir);
      setPage(nextPage);
      setChunkIndex(delta > 0 ? 0 : -1);
    },
    [book, page, resolvedChunkIndex, chunks.length],
  );

  /* ── glossing ──────────────────────────────────────────────── */
  const refFor = useCallback(
    (key: string): LastWord | null => {
      const ref = parsed?.words.get(key);
      if (!parsed || !ref) return null;
      const context = sentenceAt(parsed.paragraphs[ref.paraIndex] ?? '', ref.offset, locale);
      return { key, term: ref.term, context };
    },
    [parsed, locale],
  );

  const glossWord = useCallback(
    async (key: string) => {
      const ref = refFor(key);
      if (!ref) return;
      setLastWord(ref);
      if (shownGlosses.has(key) || pending.has(key)) return;

      setPending((s) => new Set(s).add(key));
      try {
        const out = await translate({
          text: ref.term,
          from: srcLang,
          to: tgtLang,
          context: ref.context,
          mode: 'word',
        });
        setGlosses((m) => new Map(m).set(key, out));
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Translation failed');
      } finally {
        setPending((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      }
    },
    [refFor, shownGlosses, pending, srcLang, tgtLang, toast],
  );

  const startPhrase = useCallback(
    async (text: string, anchor: DOMRect) => {
      setPhrase({ anchor, source: text, translation: null });
      try {
        const out = await translate({ text, from: srcLang, to: tgtLang, mode: 'phrase' });
        setPhrase((p) => (p && p.source === text ? { ...p, translation: out } : p));
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Translation failed');
        setPhrase(null);
      }
    },
    [srcLang, tgtLang, toast],
  );

  /* A selection spanning more than one word-like segment is a phrase. Testing
     for whitespace (as the prototype did) would never fire in Japanese,
     Chinese, Thai or Khmer. */
  const isPhrase = useCallback(
    (text: string) => tokenize(text, locale).filter((t) => t.isWord).length > 1,
    [locale],
  );

  /* ── the margin ────────────────────────────────────────────── */
  const keep = useCallback(
    async (term: string, translation: string, context: string, kind: WordKind) => {
      if (!session || !book) return;
      if (bookWords.some((w) => w.term.toLowerCase() === term.toLowerCase())) {
        toast('Already in the margin');
        return;
      }
      try {
        const saved = await saveWord(
          {
            book_id: book.id,
            term,
            translation,
            context: context || null,
            page: page + 1,
            kind,
          },
          session.user.id,
        );
        setWords((ws) => [saved, ...ws]);
        toast('Kept — ' + term);
      } catch (e) {
        const code = (e as { code?: string })?.code;
        toast(code === '23505' ? 'Already in the margin' : 'Could not save that word');
      }
    },
    [session, book, bookWords, page, toast],
  );

  /* Tap/Enter on a word: gloss it if it isn't glossed yet, otherwise save it
     — see onSheetMouseUp and onSheetKeyDown below. */
  const activateWord = useCallback(
    (key: string) => {
      if (shownGlosses.has(key) && !pending.has(key)) {
        const ref = refFor(key);
        const translation = shownGlosses.get(key);
        if (ref && translation) void keep(ref.term, translation, ref.context, 'word');
        return;
      }
      void glossWord(key);
    },
    [shownGlosses, pending, refFor, keep, glossWord],
  );

  /* A tap/click on a word glosses it. A second tap on that same word — now
     that it already carries a gloss — saves it to the margin instead of
     re-requesting a translation. This is the touch path: there is no "press
     S" on an iPad, so tap-tap-to-save has to work without a keyboard. A drag
     across more than one word is still read as a phrase selection. */
  const onSheetMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const sel = window.getSelection();
      const picked = sel?.toString().trim() ?? '';
      if (picked && sel && sel.rangeCount > 0 && isPhrase(picked)) {
        startPhrase(picked, sel.getRangeAt(0).getBoundingClientRect());
        return;
      }
      const el = (e.target as HTMLElement).closest<HTMLElement>('.w');
      if (!el?.dataset.key) return;
      setPhrase(null);
      activateWord(el.dataset.key);
    },
    [isPhrase, startPhrase, activateWord],
  );

  /* Known gap §5: the prototype was mouse-only. Words are tabbable and
     Enter or Space glosses the focused one, then saves it on a second press
     — same tap-tap rule as the pointer path above. */
  const onSheetKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('.w');
      if (!el?.dataset.key) return;
      e.preventDefault();
      activateWord(el.dataset.key);
    },
    [activateWord],
  );

  /* Swipe left/right turns the page on touch devices, alongside the Pager
     arrows. A long-press-to-select gesture stays put (native selection
     handles), while a quick horizontal drag reads as a page turn — the two
     rarely overlap in practice, so no extra disambiguation is needed. */
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onSheetTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  }, []);
  const onSheetTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      go(dx < 0 ? 1 : -1);
    },
    [go],
  );

  const onSheetFocus = useCallback(
    (e: React.FocusEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.w');
      if (!el?.dataset.key) return;
      const ref = refFor(el.dataset.key);
      if (ref) setLastWord(ref);
    },
    [refFor],
  );

  const keepLastWord = useCallback(() => {
    if (!lastWord) return;
    const translation = shownGlosses.get(lastWord.key);
    if (!translation) return;
    void keep(lastWord.term, translation, lastWord.context, 'word');
  }, [lastWord, shownGlosses, keep]);

  const removeWord = useCallback(
    async (id: string) => {
      const before = words;
      setWords((ws) => ws.filter((w) => w.id !== id));
      try {
        await deleteWord(id);
      } catch {
        setWords(before);
        toast('Could not remove that word');
      }
    },
    [words, toast],
  );

  /* ── global keys ───────────────────────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'Escape') {
        setPhrase(null);
        return;
      }
      if (!book || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 's' || e.key === 'S') keepLastWord();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [book, go, keepLastWord]);

  /* ── drag and drop ─────────────────────────────────────────── */
  useEffect(() => {
    if (!session) return;
    const over = (e: DragEvent) => {
      e.preventDefault();
      setDropping(true);
    };
    const leave = (e: DragEvent) => {
      e.preventDefault();
      setDropping(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDropping(false);
      const f = e.dataTransfer?.files[0];
      if (f) void handleFile(f);
    };
    document.addEventListener('dragover', over);
    document.addEventListener('dragenter', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragover', over);
      document.removeEventListener('dragenter', over);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('drop', drop);
    };
  }, [session, handleFile]);

  /* ── render ────────────────────────────────────────────────── */
  if (!isConfigured) {
    return (
      <div className="auth">
        <div className="auth-box">
          <div className="mark">
            Gloss<sup>01</sup>
          </div>
          <p>Not configured yet.</p>
          <div className="auth-note">
            Copy <b>.env.example</b> to <b>.env.local</b> and set VITE_SUPABASE_URL and
            VITE_SUPABASE_ANON_KEY, then restart the dev server.
          </div>
        </div>
      </div>
    );
  }
  if (booting) return <div className="boot">…</div>;
  if (!session) return <Auth />;

  const phraseSaved = phrase
    ? bookWords.some((w) => w.term.toLowerCase() === phrase.source.toLowerCase())
    : false;

  return (
    <div
      className={
        (glossesOn ? '' : 'glosses-off ') + (dropping ? 'dropping' : '')
      }
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <TopBar
        srcLang={srcLang}
        tgtLang={tgtLang}
        onSrcLang={setSrcLang}
        onTgtLang={setTgtLang}
        glossesOn={glossesOn}
        onToggleGlosses={() => setGlossesOn((v) => !v)}
        hasBook={Boolean(book)}
        onCloseBook={() => setBook(null)}
        onToggleMargin={() => setMarginOpen((v) => !v)}
        onSignOut={() => void supabase.auth.signOut()}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.epub,.txt,.md"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleFile(f);
        }}
      />

      <div className="stage">
        <div className="reader-col">
          <div
            className="sheet"
            ref={sheetRef}
            style={currentChunk.fits ? undefined : { overflowY: 'auto' }}
            onMouseUp={onSheetMouseUp}
            onKeyDown={onSheetKeyDown}
            onFocus={onSheetFocus}
            onTouchStart={onSheetTouchStart}
            onTouchEnd={onSheetTouchEnd}
          >
            {book && parsed ? (
              <Page
                key={`${page}-${chunkIndex}`}
                parsed={parsed}
                glosses={shownGlosses}
                pending={pending}
                savedTerms={savedTerms}
                turnDir={turnDir}
                range={[currentChunk.start, currentChunk.end]}
              />
            ) : (
              <Shelf
                books={books}
                loading={booksLoading}
                onOpen={openBook}
                onDelete={removeBook}
                onImport={() => fileRef.current?.click()}
                importing={importing}
                status={status}
              />
            )}
          </div>

          <Pager
            title={book?.title ?? ''}
            page={page}
            pageCount={book?.page_count ?? 0}
            chunkIndex={resolvedChunkIndex}
            chunkCount={chunks.length}
          />
          <div className="spacer-b" />
        </div>

        <Margin
          words={bookWords}
          open={marginOpen}
          onJump={(p) => {
            setPage(p);
            setChunkIndex(0);
            setMarginOpen(false);
          }}
          onDelete={removeWord}
        />
      </div>

      {phrase && (
        <PhraseCard
          anchor={phrase.anchor}
          source={phrase.source}
          translation={phrase.translation}
          saved={phraseSaved}
          onSave={() => {
            if (phrase.translation) {
              void keep(phrase.source, phrase.translation, phrase.source, 'phrase');
              setPhrase(null);
            }
          }}
          onClose={() => setPhrase(null)}
        />
      )}

      {toastNode}
    </div>
  );
}
