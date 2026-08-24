/**
 * The UI speaks in names, every provider speaks in BCP-47 codes, and
 * Intl.Segmenter wants a locale. Keep one table so nothing drifts.
 */

export type Lang = {
  code: string;
  name: string;
  /** Written without spaces between words — the tokenizer must not split on whitespace. */
  unspaced?: boolean;
};

export const SOURCE_LANGS: Lang[] = [
  { code: 'auto', name: 'detect' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese', unspaced: true },
  { code: 'zh-Hans', name: 'Chinese', unspaced: true },
  { code: 'ko', name: 'Korean' },
  { code: 'th', name: 'Thai', unspaced: true },
  { code: 'km', name: 'Khmer', unspaced: true },
  { code: 'vi', name: 'Vietnamese' },
];

export const TARGET_LANGS: Lang[] = [
  { code: 'km', name: 'Khmer' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'ja', name: 'Japanese' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'zh-Hans', name: 'Chinese' },
];

const BY_CODE = new Map<string, Lang>(
  [...SOURCE_LANGS, ...TARGET_LANGS].map((l) => [l.code, l]),
);

export function langName(code: string): string {
  return BY_CODE.get(code)?.name ?? code;
}

/** The locale to hand Intl.Segmenter. `undefined` means "use the runtime default". */
export function segmenterLocale(code: string): string | undefined {
  return code === 'auto' ? undefined : code;
}
