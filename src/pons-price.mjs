import { MOSS_TOKEN } from './auction.ts';

const PAGE = `https://www.ponsfamily.com/launchpad/${MOSS_TOKEN.address}`;
const RBLX = '0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8';
const POOL = '0xc08c208a8bf53008da38fad200c3d8033f234418a6e895720a17a73090935c83';
const SCALE = 10n ** 18n;
const same = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const invalid = () => { throw Error('The Pons MOSS price is temporarily unavailable.'); };
function decimal(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) invalid();
  const [digits, exponent = '0'] = String(value).split('e'), [whole, fraction = ''] = digits.split('.');
  const units = BigInt(whole + fraction), places = 18 + Number(exponent) - fraction.length;
  return places >= 0 ? units * 10n ** BigInt(places) : units / 10n ** BigInt(-places);
}

/** Merchant eligibility uses the same two price factors displayed by Pons, without a bid/ask fallback. */
export async function readPonsMossPrice({ now = Date.now(), fetchPage = fetch } = {}) {
  if (!Number.isSafeInteger(now) || now <= 0) invalid();
  const response = await fetchPage(PAGE, { redirect: 'error', cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(12000) });
  const date = Date.parse(response.headers.get('date')), age = Number(response.headers.get('age') ?? 0);
  if (!response.ok || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '')
    || !Number.isFinite(date) || now - date > 90000 || date - now > 15000 || !Number.isFinite(age) || age < 0 || age > 90) invalid();
  const html = await response.text();
  if (html.length > 2_000_000) invalid();
  const chunks = [];
  for (const match of html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/g)) {
    const value = JSON.parse(match[1]);
    if (value[0] === 1 && typeof value[1] === 'string') chunks.push(value[1]);
  }
  const candidates = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'initialDetails')) candidates.push(value);
    else for (const child of Object.values(value)) visit(child);
  }
  for (const line of chunks.join('').split('\n')) {
    if (!/^[\da-f]+:[\[{]/i.test(line)) continue;
    visit(JSON.parse(line.slice(line.indexOf(':') + 1)));
  }
  if (candidates.length !== 1) invalid();
  const props = candidates[0], details = props.initialDetails;
  if (!same(props.token, MOSS_TOKEN.address) || !same(details?.token, MOSS_TOKEN.address) || details.decimals !== 18
    || !same(details.quoteAsset?.address, RBLX) || details.quoteAsset.decimals !== 18 || details.quoteAsset.isNative !== false
    || !same(details.poolId, POOL) || details.phase !== 2 || details.venue !== 'pool' || details.tokenIsCurrency0 !== true) invalid();
  const usdWei = decimal(props.initialPriceQuote) * decimal(props.quoteUsd) / SCALE;
  if (usdWei <= 0n || usdWei >= 2n ** 256n) invalid();
  // ponytail: Pons embeds these values in its page without a quote timestamp; use a versioned price API if one becomes available.
  // observedAt records our response check, not the age of Pons's underlying market data.
  return { usdWei: usdWei.toString(), observedAt: now, source: 'Pons MOSS/USD displayed estimate', sourceUrl: PAGE };
}
