import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast() {
  const [msg, setMsg] = useState('');
  const [on, setOn] = useState(false);
  const timer = useRef<number>();

  const toast = useCallback((text: string) => {
    setMsg(text);
    setOn(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(false), 2600);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { toast, node: <div className={'toast' + (on ? ' on' : '')} role="status">{msg}</div> };
}
