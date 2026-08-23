import { SOURCE_LANGS, TARGET_LANGS } from '../lib/languages';

type Props = {
  srcLang: string;
  tgtLang: string;
  onSrcLang: (v: string) => void;
  onTgtLang: (v: string) => void;
  glossesOn: boolean;
  onToggleGlosses: () => void;
  onImport: () => void;
  importing: boolean;
  hasBook: boolean;
  onCloseBook: () => void;
  onToggleMargin: () => void;
  onSignOut: () => void;
};

export function TopBar({
  srcLang,
  tgtLang,
  onSrcLang,
  onTgtLang,
  glossesOn,
  onToggleGlosses,
  onImport,
  importing,
  hasBook,
  onCloseBook,
  onToggleMargin,
  onSignOut,
}: Props) {
  return (
    <div className="bar">
      <span className="mark">
        Gloss<sup>01</sup>
      </span>

      <button className="chip solid" onClick={onImport} disabled={importing}>
        {importing ? 'Importing …' : 'Import a book'}
      </button>
      {hasBook && (
        <button className="chip" onClick={onCloseBook}>
          Shelf
        </button>
      )}

      <span className="bar-spacer" />

      <span className="langpair">
        <span className="lbl">reading</span>
        <select value={srcLang} onChange={(e) => onSrcLang(e.target.value)} aria-label="Source language">
          {SOURCE_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <span className="arrow">→</span>
        <select value={tgtLang} onChange={(e) => onTgtLang(e.target.value)} aria-label="Target language">
          {TARGET_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </span>

      <button className="chip" aria-pressed={glossesOn} onClick={onToggleGlosses}>
        {glossesOn ? 'Glosses on' : 'Glosses off'}
      </button>
      {hasBook && (
        <button className="chip" onClick={onToggleMargin}>
          Words
        </button>
      )}
      <button className="chip" onClick={onSignOut} title="Sign out">
        ⤶
      </button>
    </div>
  );
}
