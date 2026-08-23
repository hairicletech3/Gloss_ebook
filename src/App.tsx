import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase, isConfigured } from './lib/supabase';
import { importBook, listBooks, getBook, saveLastPage, deleteBook } from './lib/books';
import { listWords, saveWord, deleteWord } from './lib/words';
import { translate } from './lib/translate';
import { parsePage } from './lib/parsePage';
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

export default function App() {
  const { toast, node: toastNode } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  const [books, setBooks] = useState<BookMeta[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [book, setBook] = useState<Book | null>(null);
  const [page, setPage] = useState(0);

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
  }, [page, book]);

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
        setBook(full);
        setPage(Math.min(Math.max(0, full.last_page), Math.max(0, full.page_count - 1)));
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

  const go = useCallback(
    (delta: number) => {
      setPhrase(null);
      setPage((p) => {
        if (!book) return p;
        return Math.min(Math.max(0, p + delta), Math.max(0, book.page_count - 1));
      });
    },
    [book],
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
      void glossWord(el.dataset.key);
    },
    [isPhrase, startPhrase, glossWord],
  );

  /* Known gap §5: the prototype was mouse-only. Words are tabbable and
     Enter or Space glosses the focused one. */
  const onSheetKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('.w');
      if (!el?.dataset.key) return;
      e.preventDefault();
      void glossWord(el.dataset.key);
    },
    [glossWord],
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
        onImport={() => fileRef.current?.click()}
        importing={importing}
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
            onMouseUp={onSheetMouseUp}
            onKeyDown={onSheetKeyDown}
            onFocus={onSheetFocus}
          >
            {book && parsed ? (
              <Page
                parsed={parsed}
                glosses={shownGlosses}
                pending={pending}
                savedTerms={savedTerms}
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
            onGo={go}
          />
          <div className="spacer-b" />
        </div>

        <Margin
          words={bookWords}
          open={marginOpen}
          onJump={(p) => {
            setPage(p);
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
