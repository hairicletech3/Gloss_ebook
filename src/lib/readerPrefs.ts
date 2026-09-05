export type Theme = 'paper' | 'sage' | 'dark';

export type FontId = 'newsreader' | 'literata' | 'atkinson' | 'system';

export type ReaderPrefs = {
  /** The reading text's typeface. Scoped to the page: the margin, the cards
      and the chrome stay on --body, so changing this changes what you read
      rather than restyling the whole app. */
  font: FontId;
  /** Reading size in px. The gloss scales off this, so it is the one dial. */
  size: number;
  /** Leading as a multiplier. The gloss is drawn into this space — see MIN. */
  leading: number;
  theme: Theme;
};

export const SIZE_MIN = 15;
export const SIZE_MAX = 26;
export const SIZE_STEP = 1;

/**
 * The gloss is painted by CSS into the space the leading reserves above each
 * line (see `.w[data-gloss]::before`). Below about 1.7 it starts colliding
 * with the line above, so that is the floor rather than a matter of taste.
 */
export const LEADING_MIN = 1.7;
export const LEADING_MAX = 2.6;
export const LEADING_STEP = 0.05;

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'paper', label: 'Paper' },
  { id: 'sage', label: 'Sage' },
  { id: 'dark', label: 'Night' },
];

/**
 * Four faces, each earning its slot rather than padding a list: the original
 * serif, a serif drawn for screens, a face built for low vision, and the
 * one that costs no download at all.
 *
 * `family` is what document.fonts.load needs to wait on before the page can
 * be re-measured — see App. It is null where nothing is fetched.
 */
export const FONTS: {
  id: FontId;
  label: string;
  note: string;
  stack: string;
  family: string | null;
}[] = [
  {
    id: 'newsreader',
    label: 'Newsreader',
    note: 'Serif · the original',
    stack: "'Newsreader', Georgia, 'Times New Roman', serif",
    family: 'Newsreader',
  },
  {
    id: 'literata',
    label: 'Literata',
    note: 'Serif · drawn for screens',
    stack: "'Literata', Georgia, serif",
    family: 'Literata',
  },
  {
    id: 'atkinson',
    label: 'Atkinson Hyperlegible',
    note: 'Sans · letters kept distinct',
    stack: "'Atkinson Hyperlegible', system-ui, sans-serif",
    family: 'Atkinson Hyperlegible',
  },
  {
    id: 'system',
    label: 'System',
    note: 'Sans · nothing to download',
    stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    family: null,
  },
];

export const fontById = (id: FontId) => FONTS.find((f) => f.id === id) ?? FONTS[0];

/** Sage took Sepia's slot. Without this, anyone who had Sepia selected fails
    the validity check below and is silently dropped back to Paper — which
    reads as the setting having been forgotten rather than renamed. */
const RENAMED: Record<string, Theme> = { sepia: 'sage' };

const KEY = 'gloss.reader';

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function defaultPrefs(): ReaderPrefs {
  return {
    font: 'newsreader',
    // A phone gets a smaller default, matching what the old fixed stylesheet
    // rule used to do at this breakpoint.
    size: typeof window !== 'undefined' && window.innerWidth <= 680 ? 17.5 : 19,
    leading: 2.05,
    theme: 'paper',
  };
}

export function loadPrefs(): ReaderPrefs {
  const base = defaultPrefs();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<ReaderPrefs>;
    const theme = RENAMED[saved.theme as string] ?? saved.theme;
    return {
      font: FONTS.some((f) => f.id === saved.font) ? (saved.font as FontId) : base.font,
      size: clamp(Number(saved.size) || base.size, SIZE_MIN, SIZE_MAX),
      leading: clamp(Number(saved.leading) || base.leading, LEADING_MIN, LEADING_MAX),
      theme: THEMES.some((t) => t.id === theme) ? (theme as Theme) : base.theme,
    };
  } catch {
    return base;
  }
}

export function savePrefs(p: ReaderPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode, quota — the reader still works, it just won't remember */
  }
}

/**
 * Written onto <html> rather than a React-rendered element so the hidden
 * measurement probe in useScreenChunks — which lives on <body>, outside the
 * app tree — inherits exactly the same type as the real page.
 */
export function applyPrefs(p: ReaderPrefs) {
  const root = document.documentElement;
  root.style.setProperty('--reading-font', fontById(p.font).stack);
  root.style.setProperty('--reading-size', p.size + 'px');
  root.style.setProperty('--reading-leading', String(p.leading));
  root.dataset.theme = p.theme;
}
