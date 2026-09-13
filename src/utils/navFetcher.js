// Fetches NAV for Tunisian SICAV/FCP funds.
// Primary source: millim.tn (doesn't block CORS proxies).
// Fallback: ilboursa.com (returns 403 to most proxies but kept as last resort).
// Cache TTL: 24h.

import { TUNISIAN_FUNDS } from './tunisianFunds';

const MILLIM_BASE = 'https://www.millim.tn/fund/';
const ILBOURSA_BASE = 'https://www.ilboursa.com/opcvm/';
export const NAV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// millim.tn: NAV rendered as "23.155TND" or "159.984TND" in SSR HTML.
// Also check __NEXT_DATA__ JSON blob which Next.js embeds in every page.
const MILLIM_PATTERNS = [
  // __NEXT_DATA__ JSON — most reliable
  /"(?:nav|vl|value|valeur_liquidative)"\s*:\s*([\d.]+)/i,
  // Direct number+TND in HTML (no space between them)
  /(\d+\.\d{2,4})TND/,
  // Number followed by TND within 80 chars (HTML tags in between)
  /(\d+\.\d{2,4})[^,\d]{0,80}?TND/,
];

// ilboursa.com: French format "23,07" or "1 234,56" after the heading.
const ILBOURSA_REGEX = /VALEUR LIQUIDATIVE[\s\S]{0,600}?(\d[\d\s]*,\d+)/;

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
        throw new Error(`target returned HTTP ${json.status.http_code}`);
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

async function tryFetch(targetUrl, patterns) {
  const errors = [];
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy.buildUrl(targetUrl), { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await proxy.extractHtml(res);
      if (!html || html.length < 200) throw new Error('near-empty body');
      for (const pat of patterns) {
        const m = html.match(pat);
        if (m) {
          // millim values use period; ilboursa uses comma — normalise both
          const nav = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
          if (Number.isFinite(nav) && nav > 0) return nav;
        }
      }
      throw new Error('NAV pattern not found');
    } catch (err) {
      errors.push(`[${proxy.name}] ${err.message}`);
    }
  }
  return { errors };
}

export async function fetchNav(slug) {
  const fund = TUNISIAN_FUNDS.find(f => f.slug === slug);
  const allErrors = [];

  // 1. Try millim.tn first (doesn't block CORS proxies)
  if (fund?.millimSlug) {
    const result = await tryFetch(`${MILLIM_BASE}${fund.millimSlug}/`, MILLIM_PATTERNS);
    if (typeof result === 'number') return result;
    allErrors.push(...result.errors.map(e => `millim: ${e}`));
  }

  // 2. Fall back to ilboursa.com
  const result = await tryFetch(`${ILBOURSA_BASE}${slug}`, [ILBOURSA_REGEX]);
  if (typeof result === 'number') return result;
  allErrors.push(...result.errors.map(e => `ilboursa: ${e}`));

  throw new Error(allErrors.join(' | '));
}

export function isNavStale(fetchedAt) {
  if (!fetchedAt) return true;
  return Date.now() - new Date(fetchedAt).getTime() > NAV_CACHE_TTL_MS;
}
