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
import {
  listHighlights,
  saveHighlight,
  updateHighlightNote,
  deleteHighlight,
} from './lib/highlights';
import { anchorsFromSelection, tokensForHighlights } from './lib/highlightAnchor';
import type {
  Book,
  BookMeta,
  Highlight,
  HighlightColor,
  Word,
  WordKind,
} from './lib/types';

import { Auth } from './components/Auth';
import { TopBar } from './components/TopBar';
import { Shelf } from './components/Shelf';
import { Page } from './components/Page';
import { Pager } from './components/Pager';
import { Margin } from './components/Margin';
import { PhraseCard } from './components/PhraseCard';
import { NoteCard } from './components/NoteCard';
import { NotePeek } from './components/NotePeek';
import { useToast } from './components/Toast';

type LastWord = { key: string; term: string; context: string };
type Phrase = {
  anchor: DOMRect;
  source: string;
  translation: string | null;
  /** Translation came back empty or errored. The card stays up regardless —
      highlighting a passage must not depend on the translator working. */
  failed: boolean;
};

const LS_SRC = 'gloss.srcLang';
const LS_TGT = 'gloss.tgtLang';
const LS_MARGIN = 'gloss.marginOpen';
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
  /** Jump target as a paragraph rather than a chunk number: which chunk holds
      it isn't known until useScreenChunks measures the new page, and that
      answer changes with the window size. Resolved at render time below. */
  const [targetPara, setTargetPara] = useState<number | null>(null);
  const [turnDir, setTurnDir] = useState<'next' | 'prev' | null>(null);
  /** Briefly lit after jumping to it, so the eye can find it on arrival. */
  const [flashId, setFlashId] = useState<string | null>(null);

  const [words, setWords] = useState<Word[]>([]);
  const [glosses, setGlosses] = useState<Map<string, string>>(new Map());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [lastWord, setLastWord] = useState<LastWord | null>(null);
  const [phrase, setPhrase] = useState<Phrase | null>(null);

  const [highlights, setHighlights] = useState<Highlight[]>([]);
  /** The highlight whose note card is open, plus where to anchor that card. */
  const [editing, setEditing] = useState<{ id: string; anchor: DOMRect } | null>(null);
  /** Note being previewed by hovering its marker in the page. */
  const [peek, setPeek] = useState<{ note: string; anchor: DOMRect } | null>(null);

  const [srcLang, setSrcLang] = useState(() => localStorage.getItem(LS_SRC) || 'auto');
  const [tgtLang, setTgtLang] = useState(() => localStorage.getItem(LS_TGT) || 'km');
  const [glossesOn, setGlossesOn] = useState(true);
  /* Open by default where there's room for a side panel, closed on a phone
     where it covers the page as a bottom sheet. Remembered either way. */
  const [marginOpen, setMarginOpen] = useState(() => {
    const saved = localStorage.getItem(LS_MARGIN);
    if (saved !== null) return saved === '1';
    return window.innerWidth > 680;
  });

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
  useEffect(() => {
    localStorage.setItem(LS_MARGIN, marginOpen ? '1' : '0');
  }, [marginOpen]);

  /* ── library + margin load ─────────────────────────────────── */
  useEffect(() => {
    if (!session) {
      setBooks([]);
      setWords([]);
      setHighlights([]);
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
  /* A pending jump wins over chunkIndex until it lands, for the same reason
     the -1 sentinel does: it re-resolves against freshly measured chunks
     instead of a number captured before they existed. */
  const paraChunk =
    targetPara === null
      ? -1
      : chunks.findIndex((c) => targetPara >= c.start && targetPara < c.end);
  const resolvedChunkIndex =
    paraChunk >= 0
      ? paraChunk
      : chunkIndex < 0
        ? chunks.length - 1
        : Math.min(chunkIndex, chunks.length - 1);
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

  /* Only this page's highlights need painting, but the margin lists them all. */
  const pageHighlights = useMemo(
    () => highlights.filter((h) => h.page === page),
    [highlights, page],
  );
  const highlightedTokens = useMemo(
    () => (parsed ? tokensForHighlights(parsed, pageHighlights) : new Map()),
    [parsed, pageHighlights],
  );
  const editingHighlight = useMemo(
    () => (editing ? highlights.find((h) => h.id === editing.id) ?? null : null),
    [editing, highlights],
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
    // The markers under the pointer are gone after a turn, so no pointerout
    // is coming to close a preview that's still open.
    setPeek(null);
  }, [page, chunkIndex, book]);

  /* Highlights are per-book and can be many, so they load with the book
     rather than up front with the library. */
  useEffect(() => {
    if (!book) {
      setHighlights([]);
      return;
    }
    let alive = true;
    const id = book.id;
    listHighlights(id)
      .then((h) => alive && setHighlights(h))
      .catch(() => alive && toast('Could not load your highlights'));
    return () => {
      alive = false;
    };
  }, [book, toast]);

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
        setTargetPara(null);
        setFlashId(null);
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
      // Turning a page ends any pending jump — from here the chunk number is
      // what's being navigated, not the paragraph we were sent to.
      setTargetPara(null);
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
      setPhrase({ anchor, source: text, translation: null, failed: false });
      try {
        const out = await translate({ text, from: srcLang, to: tgtLang, mode: 'phrase' });
        setPhrase((p) => (p && p.source === text ? { ...p, translation: out } : p));
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Translation failed');
        // Leave the card up: its highlight swatches are the only pointer-driven
        // way to mark a passage, and they must survive a dead translator.
        setPhrase((p) => (p && p.source === text ? { ...p, failed: true } : p));
      }
    },
    [srcLang, tgtLang, toast],
  );

  /* ── highlights ────────────────────────────────────────────── */

  /** Marks whatever is selected right now. One row per paragraph touched. */
  const highlightSelection = useCallback(
    async (color: HighlightColor) => {
      if (!session || !book || !parsed) return;
      const sheet = sheetRef.current;
      const sel = window.getSelection();
      if (!sheet || !sel || sel.rangeCount === 0 || !sel.toString().trim()) return;

      const anchors = anchorsFromSelection(sel.getRangeAt(0), parsed, sheet, page);
      if (!anchors.length) return;

      sel.removeAllRanges();
      setPhrase(null);
      try {
        const saved = await Promise.all(
          anchors.map((a) =>
            saveHighlight({ ...a, book_id: book.id, note: null, color }, session.user.id),
          ),
        );
        setHighlights((hs) => [...hs, ...saved]);
      } catch {
        toast('Could not save that highlight');
      }
    },
    [session, book, parsed, page, toast],
  );

  const changeHighlightColor = useCallback(
    async (id: string, color: HighlightColor) => {
      const before = highlights;
      setHighlights((hs) => hs.map((h) => (h.id === id ? { ...h, color } : h)));
      const { error } = await supabase.from('highlights').update({ color }).eq('id', id);
      if (error) {
        setHighlights(before);
        toast('Could not change that colour');
      }
    },
    [highlights, toast],
  );

  const saveNote = useCallback(
    async (id: string, note: string | null) => {
      const before = highlights;
      setHighlights((hs) => hs.map((h) => (h.id === id ? { ...h, note } : h)));
      try {
        await updateHighlightNote(id, note);
        toast(note ? 'Note saved' : 'Note cleared');
      } catch {
        setHighlights(before);
        toast('Could not save that note');
      }
    },
    [highlights, toast],
  );

  /** Follows a note in the margin back to the passage it was written against. */
  const jumpToHighlight = useCallback((h: Highlight) => {
    setPage(h.page);
    setTargetPara(h.para_index);
    setChunkIndex(0);
    setFlashId(h.id);
    setEditing(null);
    setPhrase(null);
    if (window.innerWidth <= 680) setMarginOpen(false);
  }, []);

  useEffect(() => {
    if (!flashId) return;
    const t = window.setTimeout(() => setFlashId(null), 1400);
    return () => window.clearTimeout(t);
  }, [flashId]);

  const removeHighlight = useCallback(
    async (id: string) => {
      const before = highlights;
      setHighlights((hs) => hs.filter((h) => h.id !== id));
      setEditing((e) => (e?.id === id ? null : e));
      try {
        await deleteHighlight(id);
      } catch {
        setHighlights(before);
        toast('Could not remove that highlight');
      }
    },
    [highlights, toast],
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

      /* A plain click on an existing highlight opens its note. Glossing a
         word that happens to sit inside a highlight is still reachable by
         selecting it, which takes the branch above / below instead. */
      const target = e.target as HTMLElement;
      if (!picked) {
        const marked = target.closest<HTMLElement>('[data-hl]');
        if (marked?.dataset.hl) {
          setPhrase(null);
          setEditing({ id: marked.dataset.hl, anchor: marked.getBoundingClientRect() });
          return;
        }
      }

      const el = target.closest<HTMLElement>('.w');
      if (!el?.dataset.key) return;
      setPhrase(null);
      setEditing(null);
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

  /* Clicking anywhere outside the open note card dismisses it. Registered
     only while the card is up, so the very click that opened it (already
     finished by the time this effect runs) can't close it again. */
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('.notecard')) return;
      setEditing(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editing]);

  /* Hovering a note marker previews the note. Delegated from the sheet so it
     survives the page re-rendering underneath it. */
  const onSheetPointerOver = useCallback((e: React.PointerEvent) => {
    const pin = (e.target as HTMLElement).closest<HTMLElement>('.hl-pin');
    if (!pin?.dataset.note) return;
    setPeek({ note: pin.dataset.note, anchor: pin.getBoundingClientRect() });
  }, []);

  const onSheetPointerOut = useCallback((e: React.PointerEvent) => {
    const pin = (e.target as HTMLElement).closest<HTMLElement>('.hl-pin');
    if (pin) setPeek(null);
  }, []);

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
        setEditing(null);
        return;
      }
      if (!book || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 's' || e.key === 'S') keepLastWord();
      // H marks the current selection, so a single word can be highlighted
      // too — the card's swatches only appear for multi-word selections.
      else if (e.key === 'h' || e.key === 'H') void highlightSelection('yellow');
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [book, go, keepLastWord, highlightSelection]);

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
        marginOpen={marginOpen}
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
            onPointerOver={onSheetPointerOver}
            onPointerOut={onSheetPointerOut}
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
                highlighted={highlightedTokens}
                flashId={flashId}
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
          highlights={highlights}
          open={marginOpen}
          onJumpHighlight={jumpToHighlight}
          onJump={(p) => {
            setPage(p);
            setChunkIndex(0);
            setTargetPara(null);
            // On a phone the margin covers the page, so jumping has to
            // dismiss it. On a wider screen it sits beside the text — closing
            // it there would just take the list away mid-use.
            if (window.innerWidth <= 680) setMarginOpen(false);
          }}
          onDelete={removeWord}
          onDeleteHighlight={removeHighlight}
          onClose={() => setMarginOpen(false)}
        />
      </div>

      {phrase && (
        <PhraseCard
          anchor={phrase.anchor}
          source={phrase.source}
          translation={phrase.translation}
          failed={phrase.failed}
          saved={phraseSaved}
          onSave={() => {
            if (phrase.translation) {
              void keep(phrase.source, phrase.translation, phrase.source, 'phrase');
              setPhrase(null);
            }
          }}
          onHighlight={(color) => void highlightSelection(color)}
          onClose={() => setPhrase(null)}
        />
      )}

      {peek && !editing && <NotePeek anchor={peek.anchor} note={peek.note} />}

      {editing && editingHighlight && (
        <NoteCard
          anchor={editing.anchor}
          highlight={editingHighlight}
          onSaveNote={(note) => void saveNote(editingHighlight.id, note)}
          onColor={(color) => void changeHighlightColor(editingHighlight.id, color)}
          onDelete={() => void removeHighlight(editingHighlight.id)}
          onClose={() => setEditing(null)}
        />
      )}

      {toastNode}
    </div>
  );
}
