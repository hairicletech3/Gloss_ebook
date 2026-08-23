import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { callProvider, ProviderError, type Mode } from './providers.ts';

/**
 * POST /functions/v1/translate
 *   body: { text, from, to, context?, mode: 'word' | 'phrase' }
 *   →     { translation, cached: boolean }
 *
 * The provider key lives in this function's secrets and never leaves it.
 */

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const MAX_TEXT = 2000;

/* Rate limit: ~60 uncached calls a minute per user, so a runaway loop can't
   drain the free tier. In-memory, so the ceiling is per isolate rather than
   global — at single-user volume that is the right amount of machinery. */
const WINDOW_MS = 60_000;
const MAX_UNCACHED = Number(Deno.env.get('RATE_LIMIT_PER_MIN') ?? 60);
const recent = new Map<string, number[]>();

function withinRateLimit(userId: string): boolean {
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= MAX_UNCACHED) {
    recent.set(userId, times);
    return false;
  }
  times.push(now);
  recent.set(userId, times);
  return true;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  /* 1. Verify the caller's JWT. Reject anonymous requests. */
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Sign in first.' }, 401);

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'Sign in first.' }, 401);
  const userId = userData.user.id;

  /* 2. Validate. */
  let body: { text?: string; from?: string; to?: string; context?: string; mode?: Mode };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const text = (body.text ?? '').trim();
  const from = (body.from ?? 'auto').trim();
  const to = (body.to ?? '').trim();
  const mode: Mode = body.mode === 'phrase' ? 'phrase' : 'word';
  const context = (body.context ?? '').slice(0, MAX_TEXT);

  if (!text) return json({ error: 'Nothing to translate.' }, 400);
  if (text.length > MAX_TEXT) return json({ error: 'That selection is too long.' }, 400);
  if (!to) return json({ error: 'No target language.' }, 400);
  if (from !== 'auto' && from === to) return json({ translation: text, cached: true });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  /* 3. Cache first. This is what keeps the bill at zero.
        Mode is part of the key so a phrase translation can never be served
        as a word gloss. Context deliberately is not: including it would
        make almost every lookup a miss, and the first sense recorded for a
        word is the one it keeps. */
  const hash = await sha256(`${from}|${to}|${mode}|${text.toLowerCase()}`);
  const { data: hit } = await admin
    .from('translations')
    .select('translation')
    .eq('hash', hash)
    .maybeSingle();

  if (hit?.translation) {
    await admin.rpc('bump_translation_hits', { h: hash });
    return json({ translation: hit.translation, cached: true });
  }

  /* 4. Miss — this one costs money, so it counts against the rate limit. */
  if (!withinRateLimit(userId)) {
    return json({ error: 'Too many new lookups this minute. Give it a moment.' }, 429);
  }

  try {
    const translation = await callProvider({ text, from, to, context, mode });
    await admin.from('translations').upsert(
      {
        hash,
        source_lang: from,
        target_lang: to,
        source_text: text,
        translation,
        hits: 1,
      },
      { onConflict: 'hash' },
    );
    return json({ translation, cached: false });
  } catch (e) {
    console.error(e);
    const msg =
      e instanceof ProviderError ? e.message : 'The translation service is unavailable.';
    return json({ error: msg }, 502);
  }
});
