import {
  LEADING_MAX,
  LEADING_MIN,
  LEADING_STEP,
  SIZE_MAX,
  SIZE_MIN,
  SIZE_STEP,
  THEMES,
  type ReaderPrefs,
  type Theme,
} from '../lib/readerPrefs';

type Props = {
  prefs: ReaderPrefs;
  onChange: (next: ReaderPrefs) => void;
  onClose: () => void;
};

const round = (n: number) => Math.round(n * 100) / 100;

export function ReaderSettings({ prefs, onChange, onClose }: Props) {
  const setSize = (d: number) =>
    onChange({
      ...prefs,
      size: Math.min(SIZE_MAX, Math.max(SIZE_MIN, round(prefs.size + d))),
    });

  const setLeading = (d: number) =>
    onChange({
      ...prefs,
      leading: Math.min(LEADING_MAX, Math.max(LEADING_MIN, round(prefs.leading + d))),
    });

  const setTheme = (theme: Theme) => onChange({ ...prefs, theme });

  return (
    <div className="settings" role="dialog" aria-label="Reading settings">
      <button className="card-close" onClick={onClose} title="Close" aria-label="Close">
        ×
      </button>

      <div className="settings-row">
        <span className="settings-label">Text size</span>
        <div className="stepper">
          <button
            onClick={() => setSize(-SIZE_STEP)}
            disabled={prefs.size <= SIZE_MIN}
            aria-label="Smaller text"
          >
            −
          </button>
          <span className="stepper-value">{prefs.size}px</span>
          <button
            onClick={() => setSize(SIZE_STEP)}
            disabled={prefs.size >= SIZE_MAX}
            aria-label="Larger text"
          >
            +
          </button>
        </div>
      </div>

      <div className="settings-row">
        <span className="settings-label">Line spacing</span>
        <div className="stepper">
          <button
            onClick={() => setLeading(-LEADING_STEP)}
            disabled={prefs.leading <= LEADING_MIN}
            aria-label="Tighter lines"
          >
            −
          </button>
          <span className="stepper-value">{prefs.leading.toFixed(2)}</span>
          <button
            onClick={() => setLeading(LEADING_STEP)}
            disabled={prefs.leading >= LEADING_MAX}
            aria-label="Looser lines"
          >
            +
          </button>
        </div>
      </div>

      {/* The gloss is drawn into the leading, so the floor here is mechanical
          rather than aesthetic — see LEADING_MIN. */}
      <div className="settings-row settings-themes">
        <span className="settings-label">Theme</span>
        <div className="theme-picker">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={t.id === prefs.theme ? 'on' : ''}
              aria-pressed={t.id === prefs.theme}
              onClick={() => setTheme(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
