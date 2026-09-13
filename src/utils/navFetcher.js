// Fetches NAV (valeur liquidative) for Tunisian SICAV/FCP funds from ilboursa.com.
// Uses allorigins.win as a CORS proxy since ilboursa doesn't expose a public API.
// Cache TTL: 24h — funds publish NAV daily, no need to fetch more often.

const ILBOURSA_BASE = 'https://www.ilboursa.com/opcvm/';
const PROXY = 'https://api.allorigins.win/get?url=';
export const NAV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Regex: after "VALEUR LIQUIDATIVE" heading, capture the first French-format number
// (e.g. "23,07" or "1 234,56"). Up to 400 chars of intervening HTML allowed.
const NAV_REGEX = /VALEUR LIQUIDATIVE[\s\S]{0,400}?(\d[\d  ]*,\d+)/;

export async function fetchNav(slug) {
  const targetUrl = `${ILBOURSA_BASE}${slug}`;
  const proxyUrl = `${PROXY}${encodeURIComponent(targetUrl)}`;

  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Proxy returned ${res.status}`);

  const json = await res.json();
  const html = json?.contents;
  if (!html) throw new Error('Empty proxy response');
  if (json?.status?.http_code && json.status.http_code !== 200)
    throw new Error(`ilboursa returned ${json.status.http_code}`);

  const match = html.match(NAV_REGEX);
  if (!match) throw new Error('NAV not found — page structure may have changed');

  // French number format: remove spaces (thousands sep), replace comma with period
  const nav = parseFloat(match[1].replace(/[\s ]/g, '').replace(',', '.'));
  if (!Number.isFinite(nav) || nav <= 0) throw new Error(`Invalid NAV value: ${match[1]}`);
  return nav;
}

export function isNavStale(fetchedAt) {
  if (!fetchedAt) return true;
  return Date.now() - new Date(fetchedAt).getTime() > NAV_CACHE_TTL_MS;
}
