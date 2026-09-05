export type Theme = 'paper' | 'sepia' | 'dark';

export type ReaderPrefs = {
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
  { id: 'sepia', label: 'Sepia' },
  { id: 'dark', label: 'Dark' },
];

const KEY = 'gloss.reader';

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function defaultPrefs(): ReaderPrefs {
  return {
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
    return {
      size: clamp(Number(saved.size) || base.size, SIZE_MIN, SIZE_MAX),
      leading: clamp(Number(saved.leading) || base.leading, LEADING_MIN, LEADING_MAX),
      theme: THEMES.some((t) => t.id === saved.theme) ? (saved.theme as Theme) : base.theme,
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
  root.style.setProperty('--reading-size', p.size + 'px');
  root.style.setProperty('--reading-leading', String(p.leading));
  root.dataset.theme = p.theme;
}
