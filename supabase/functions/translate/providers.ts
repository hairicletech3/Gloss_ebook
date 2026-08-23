/**
 * Every provider hides behind callProvider(), so switching is a single-file
 * change. The API key is read from Edge Function secrets here and nowhere
 * else — it must never reach the browser.
 */

export type Mode = 'word' | 'phrase';

export type ProviderArgs = {
  text: string;
  /** BCP-47, or 'auto' to let the provider detect. */
  from: string;
  to: string;
  context?: string;
  mode: Mode;
};

export class ProviderError extends Error {}

const NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  th: 'Thai',
  km: 'Khmer',
  vi: 'Vietnamese',
  'zh-Hans': 'Chinese (Simplified)',
};
const nameOf = (code: string) => NAMES[code] ?? code;

/* ── Azure Translator ──────────────────────────────────────────────────
   $10 per million characters on top of a 2M chars/month permanent free
   tier — the largest of the majors. Clicking a word sends ~8 characters,
   so the free tier is roughly 250,000 lookups a month.               */

const AZURE_HOST =
  Deno.env.get('AZURE_TRANSLATOR_ENDPOINT') ??
  'https://api.cognitive.microsofttranslator.com';

function azureHeaders() {
  const key = Deno.env.get('AZURE_TRANSLATOR_KEY');
  if (!key) throw new ProviderError('AZURE_TRANSLATOR_KEY is not set on the function.');
  const headers: Record<string, string> = {
    'Ocp-Apim-Subscription-Key': key,
    'Content-Type': 'application/json',
  };
  const region = Deno.env.get('AZURE_TRANSLATOR_REGION');
  if (region) headers['Ocp-Apim-Subscription-Region'] = region;
  return headers;
}

async function azurePost(path: string, params: URLSearchParams, text: string) {
  const res = await fetch(`${AZURE_HOST}${path}?${params}`, {
    method: 'POST',
    headers: azureHeaders(),
    body: JSON.stringify([{ Text: text }]),
  });
  if (!res.ok) {
    throw new ProviderError(`Azure Translator returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function azureTranslate(args: ProviderArgs): Promise<string> {
  const params = new URLSearchParams({ 'api-version': '3.0', to: args.to });
  if (args.from !== 'auto') params.set('from', args.from);
  const data = await azurePost('/translate', params, args.text);
  const out = data?.[0]?.translations?.[0]?.text;
  if (!out) throw new ProviderError('Azure Translator returned no translation.');
  return out;
}

/**
 * Word mode wants a short dictionary sense, not a literal sentence
 * translation. Azure's dictionary endpoint gives exactly that — but it needs
 * an explicit source language and does not cover every pair, so fall back to
 * plain translation whenever it comes up empty.
 */
async function azureLookup(args: ProviderArgs): Promise<string> {
  if (args.from === 'auto') return azureTranslate(args);
  try {
    const params = new URLSearchParams({
      'api-version': '3.0',
      from: args.from,
      to: args.to,
    });
    const data = await azurePost('/dictionary/lookup', params, args.text);
    const senses: string[] = (data?.[0]?.translations ?? [])
      .slice(0, 2)
      .map((t: { displayTarget?: string; normalizedTarget?: string }) =>
        t.displayTarget ?? t.normalizedTarget ?? '',
      )
      .filter(Boolean);
    if (senses.length) return senses.join(', ');
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
    // Unsupported pair or no dictionary entry — fall through.
  }
  return azureTranslate(args);
}

/* ── Anthropic (LLM) ───────────────────────────────────────────────────
   Costs more per lookup than an NMT API but disambiguates a word against
   the sentence it appears in, which is what makes a gloss useful.     */

async function anthropicTranslate(args: ProviderArgs): Promise<string> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new ProviderError('ANTHROPIC_API_KEY is not set on the function.');

  const brief =
    args.mode === 'word'
      ? 'Give the single most likely meaning of this word as it is used in the sentence. Two or three words at most.'
      : 'Translate this passage naturally.';

  const prompt = `You are a bilingual dictionary for a reader.
${brief}
Source language: ${args.from === 'auto' ? 'detect it' : nameOf(args.from)}
Target language: ${nameOf(args.to)}

Sentence for context: ${args.context || '(none)'}
Text to translate: ${args.text}

Reply with ONLY a JSON object, no markdown fence, no preamble:
{"translation":"…"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new ProviderError(`Anthropic returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const raw: string = (data.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');

  // Parse defensively: models fence JSON even when told not to.
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.translation === 'string' && parsed.translation.trim()) {
      return parsed.translation.trim();
    }
  } catch {
    const m = cleaned.match(/"translation"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) return JSON.parse(`"${m[1]}"`);
  }
  throw new ProviderError('Could not parse the translation response.');
}

/* ── the one switch ────────────────────────────────────────────────── */

export async function callProvider(args: ProviderArgs): Promise<string> {
  const provider = (Deno.env.get('TRANSLATE_PROVIDER') ?? 'azure').toLowerCase();
  switch (provider) {
    case 'azure':
      return args.mode === 'word' ? azureLookup(args) : azureTranslate(args);
    case 'anthropic':
      return anthropicTranslate(args);
    default:
      throw new ProviderError(`Unknown TRANSLATE_PROVIDER "${provider}".`);
  }
}
