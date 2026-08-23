import { supabase } from './supabase';
import type { TranslateMode } from './types';

/**
 * One session-lifetime memo in front of the Edge Function's shared cache.
 * Saves the round trip when you re-click a word you already glossed.
 */
const memo = new Map<string, string>();

export type TranslateArgs = {
  text: string;
  from: string;
  to: string;
  context?: string;
  mode: TranslateMode;
};

export class TranslateError extends Error {}

export async function translate({
  text,
  from,
  to,
  context,
  mode,
}: TranslateArgs): Promise<string> {
  const key = `${from}|${to}|${mode}|${text.toLowerCase()}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;

  const { data, error } = await supabase.functions.invoke('translate', {
    body: { text, from, to, context, mode },
  });

  if (error) {
    // FunctionsHttpError carries the function's own JSON body; it explains
    // the rate limit and provider failures far better than "non-2xx".
    let detail = error.message;
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === 'function') {
      try {
        const body = await res.json();
        if (body?.error) detail = body.error;
      } catch {
        /* not JSON */
      }
    }
    throw new TranslateError(detail);
  }

  const translation = (data as { translation?: string } | null)?.translation;
  if (!translation) throw new TranslateError('The translator returned nothing.');

  memo.set(key, translation);
  return translation;
}
