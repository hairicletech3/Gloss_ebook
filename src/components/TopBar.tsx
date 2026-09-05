type Props = {
  marginOpen: boolean;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onCloseBook: () => void;
  onToggleMargin: () => void;
  onSignOut: () => void;
};

export function TopBar({
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

      <button
        className="chip settings-chip"
        aria-pressed={settingsOpen}
        onClick={onToggleSettings}
        title="Reading settings"
      >
        Aa
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
