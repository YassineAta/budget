// Fetches NAV (valeur liquidative) for Tunisian SICAV/FCP funds from ilboursa.com.
// Tries three CORS proxies in order; stops at first success.
// Cache TTL: 24h — funds publish NAV daily.

const ILBOURSA_BASE = 'https://www.ilboursa.com/opcvm/';
export const NAV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// French number: comma decimal, optional whitespace as thousands separator.
// e.g. "23,07" or "1 234,56". \s covers space, nbsp, thin-space, etc.
const NAV_REGEX = /VALEUR LIQUIDATIVE[\s\S]{0,600}?(\d[\d\s]*,\d+)/;

// Proxies tried in order; first success wins.
const PROXIES = [
  {
    name: 'corsproxy.io',
    buildUrl: (t) => `https://corsproxy.io/?${encodeURIComponent(t)}`,
    extractHtml: (res) => res.text(),
  },
  {
    name: 'allorigins.win',
    buildUrl: (t) => `https://api.allorigins.win/get?url=${encodeURIComponent(t)}`,
    extractHtml: async (res) => {
      const json = await res.json();
      if (json?.status?.http_code && json.status.http_code !== 200)
        throw new Error(`ilboursa returned HTTP ${json.status.http_code}`);
      if (!json?.contents) throw new Error('empty contents');
      return json.contents;
    },
  },
  {
    name: 'codetabs.com',
    buildUrl: (t) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(t)}`,
    extractHtml: (res) => res.text(),
  },
];

export async function fetchNav(slug) {
  const targetUrl = `${ILBOURSA_BASE}${slug}`;
  const errors = [];

  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy.buildUrl(targetUrl), { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const html = await proxy.extractHtml(res);
      if (!html || html.length < 200) throw new Error('near-empty body');

      const match = html.match(NAV_REGEX);
      if (!match) throw new Error('NAV pattern not found in page');

      // Remove all whitespace (thousands sep), swap comma to period, parse
      const nav = parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(nav) || nav <= 0) throw new Error(`invalid NAV "${match[1]}"`);
      return nav;
    } catch (err) {
      errors.push(`[${proxy.name}] ${err.message}`);
    }
  }

  throw new Error(errors.join(' | '));
}

export function isNavStale(fetchedAt) {
  if (!fetchedAt) return true;
  return Date.now() - new Date(fetchedAt).getTime() > NAV_CACHE_TTL_MS;
}
