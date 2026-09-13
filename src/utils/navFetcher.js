// NAV fetch strategy (in order):
// 1. public/nav-data.json  — same-origin static file updated daily by GitHub Actions, no CORS
// 2. millim.tn via CORS proxies  — fallback if static file missing/stale
// 3. ilboursa.com via CORS proxies  — last resort (usually 403'd)

import { TUNISIAN_FUNDS } from './tunisianFunds';

const MILLIM_BASE = 'https://www.millim.tn/fund/';
const ILBOURSA_BASE = 'https://www.ilboursa.com/opcvm/';
export const NAV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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
        throw new Error(`target HTTP ${json.status.http_code}`);
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

const MILLIM_PATTERNS = [
  /"nav"\s*:\s*([\d.]+)/i,
  /"vl"\s*:\s*([\d.]+)/i,
  /([\d]+\.[\d]{2,4})[^,\d]{0,60}TND/,
];
const ILBOURSA_REGEX = /VALEUR LIQUIDATIVE[\s\S]{0,600}?(\d[\d\s]*,\d+)/;

async function tryProxies(targetUrl, patterns) {
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

  // 1. Static JSON (same-origin, deployed by GitHub Actions daily — no CORS)
  try {
    const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ?? '/';
    const res = await fetch(`${base}nav-data.json`, { cache: 'no-cache', signal: AbortSignal.timeout(5_000) });
    if (res.ok) {
      const data = await res.json();
      if (data[slug]?.nav) return Number(data[slug].nav);
    }
  } catch (_) {}

  // 2. millim.tn via CORS proxies
  if (fund?.millimSlug) {
    const result = await tryProxies(`${MILLIM_BASE}${fund.millimSlug}/`, MILLIM_PATTERNS);
    if (typeof result === 'number') return result;
    allErrors.push(...result.errors.map(e => `millim:${e}`));
  }

  // 3. ilboursa.com via CORS proxies
  const result = await tryProxies(`${ILBOURSA_BASE}${slug}`, [ILBOURSA_REGEX]);
  if (typeof result === 'number') return result;
  allErrors.push(...result.errors.map(e => `ilboursa:${e}`));

  throw new Error(allErrors.join(' | '));
}

export function isNavStale(fetchedAt) {
  if (!fetchedAt) return true;
  return Date.now() - new Date(fetchedAt).getTime() > NAV_CACHE_TTL_MS;
}
