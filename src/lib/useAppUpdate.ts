import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Registers the service worker and reports when a newer build is waiting.
 *
 * The failure mode this exists to prevent: a service worker will happily
 * serve a cached build forever, so without an explicit update path a deploy
 * can look like it did nothing — on the one device you're testing on. The
 * worker is registered with `registerType: 'prompt'`, so it installs in the
 * background and waits; `update()` is what actually swaps it in and reloads.
 */
export function useAppUpdate() {
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [update, setUpdate] = useState<(() => void) | null>(null);

  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        setNeedsRefresh(true);
      },
    });
    // Wrapped in a thunk: passing the function straight to setState would
    // have React call it as an updater instead of storing it.
    setUpdate(() => () => void updateSW(true));
  }, []);

  return { needsRefresh, update, dismiss: () => setNeedsRefresh(false) };
}
