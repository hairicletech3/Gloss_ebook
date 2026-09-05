type Props = {
  offline: boolean;
  needsRefresh: boolean;
  onUpdate: () => void;
  onDismissUpdate: () => void;
};

/**
 * The two things the app can't just handle quietly: it's offline (so some
 * actions won't work), or a newer build is installed and waiting.
 */
export function StatusBanner({ offline, needsRefresh, onUpdate, onDismissUpdate }: Props) {
  if (!offline && !needsRefresh) return null;

  return (
    <div className={'status-banner' + (offline ? ' is-offline' : '')} role="status">
      {offline ? (
        <span>
          Offline — you can read the books you've opened before. Importing and saving need a
          connection.
        </span>
      ) : (
        <>
          <span>A new version of Gloss is ready.</span>
          <span className="status-acts">
            <button className="chip" onClick={onUpdate}>
              Reload
            </button>
            <button className="chip" onClick={onDismissUpdate} title="Dismiss">
              Later
            </button>
          </span>
        </>
      )}
    </div>
  );
}
