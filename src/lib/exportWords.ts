import type { Word } from './types';

function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const q = (s: unknown) => '"' + String(s ?? '').replace(/"/g, '""') + '"';

/** Anki-importable: term, translation, context, page. */
export function exportCSV(words: Word[]) {
  download(
    'gloss-words.csv',
    'term,translation,context,page\n' +
      words.map((w) => [w.term, w.translation, w.context, w.page].map(q).join(',')).join('\n'),
    'text/csv;charset=utf-8',
  );
}

export function exportJSON(words: Word[]) {
  download(
    'gloss-words.json',
    JSON.stringify(
      words.map((w) => ({
        term: w.term,
        translation: w.translation,
        context: w.context,
        page: w.page,
        kind: w.kind,
        created_at: w.created_at,
      })),
      null,
      2,
    ),
    'application/json',
  );
}
