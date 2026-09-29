import { chatLanguageValid } from './chat-languages.ts';

// ponytail: usage resets on restart and is per realm; use a shared Google project
// character quota for a durable ceiling across EU, US and Asia.
export function createChatTranslation({ apiKey = process.env.GOOGLE_TRANSLATE_API_KEY || '', dailyCharacterLimit = Number(process.env.CHAT_TRANSLATION_DAILY_CHARACTERS || 5000), request = fetch, now = Date.now } = {}) {
  if (typeof apiKey !== 'string' || !Number.isSafeInteger(dailyCharacterLimit) || dailyCharacterLimit < 0) throw Error('Invalid chat translation configuration.');
  const enabled = !!apiKey.trim() && dailyCharacterLimit > 0, cache = new Map(), pending = new Map();
  let day = '', characters = 0;
  return { enabled, async translate(text, targetLanguage) {
    if (!enabled) throw Error('Chat translation is not enabled on this realm.');
    if (typeof text !== 'string' || !text.trim() || text.length > 160 || !chatLanguageValid(targetLanguage)) throw Error('Choose a recent chat message and a supported language.');
    const key = JSON.stringify([text, targetLanguage]), cached = cache.get(key);
    if (cached) {
      cache.delete(key);
      if (cached.until > now()) { cache.set(key, cached); return cached.text; }
    }
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 8) throw Error('Chat translation is busy. Try again shortly.');
    const today = new Date(now()).toISOString().slice(0, 10);
    if (day !== today) { day = today; characters = 0; }
    const count = [...text].length;
    if (characters + count > dailyCharacterLimit) throw Error('This realm has reached its daily translation limit.');
    // Reserve before awaiting; failures may still have been billed by Google.
    characters += count;
    const operation = Promise.resolve().then(async () => {
      try {
        const response = await request('https://translation.googleapis.com/language/translate/v2', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ q: text, target: targetLanguage, format: 'text', model: 'nmt' }),
          redirect: 'error', signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw Error();
        const result = (await response.json())?.data?.translations?.[0];
        if (typeof result?.translatedText !== 'string' || !result.translatedText.trim() || result.translatedText.length > 4000) throw Error();
        const translated = result.translatedText;
        cache.set(key, { text: translated, until: now() + 15 * 60_000 });
        while (cache.size > 2000) cache.delete(cache.keys().next().value);
        return translated;
      } catch { throw Error('Translation is temporarily unavailable. The original message is shown.'); }
      finally { pending.delete(key); }
    });
    pending.set(key, operation);
    return operation;
  } };
}
