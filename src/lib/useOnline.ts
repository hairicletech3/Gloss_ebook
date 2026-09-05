import { useEffect, useState } from 'react';

/**
 * Whether the browser thinks it has a connection.
 *
 * `navigator.onLine` is honest about "no network interface at all" and
 * optimistic about everything else — a captive portal or a dead uplink still
 * reads as online. That's the right trade here: it's used to explain a
 * failure and to disable importing, never to decide whether a read succeeds.
 * The cache is consulted when a request actually fails, not when this is false.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
