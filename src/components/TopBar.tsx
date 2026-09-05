import { SOURCE_LANGS, TARGET_LANGS } from '../lib/languages';

type Props = {
  srcLang: string;
  tgtLang: string;
  onSrcLang: (v: string) => void;
  onTgtLang: (v: string) => void;
  glossesOn: boolean;
  onToggleGlosses: () => void;
  marginOpen: boolean;
  settingsOpen: boolean;
  onToggleSettings: () => void;
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
  marginOpen,
  settingsOpen,
  onToggleSettings,
  onCloseBook,
  onToggleMargin,
  onSignOut,
}: Props) {
  return (
    <div className="bar">
      <button className="mark" onClick={onCloseBook} title="Back to your library">
        Gloss<sup>01</sup>
      </button>

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

      <button
        className="chip settings-chip"
        aria-pressed={settingsOpen}
        onClick={onToggleSettings}
        title="Reading settings"
      >
        Aa
      </button>
      <button className="chip" aria-pressed={glossesOn} onClick={onToggleGlosses}>
        {glossesOn ? 'Glosses on' : 'Glosses off'}
      </button>
      <button
        className="chip"
        aria-pressed={marginOpen}
        onClick={onToggleMargin}
        title={marginOpen ? 'Hide the margin' : 'Show the margin'}
      >
        Notes
      </button>
      <button className="chip" onClick={onSignOut} title="Sign out">
        ⤶
      </button>
    </div>
  );
}
