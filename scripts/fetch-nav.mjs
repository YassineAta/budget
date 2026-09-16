#!/usr/bin/env node
// Daily NAV for tracked Tunisian OPCVM funds, from the official CMF (Conseil du Marché Financier) Excel files.
// Run by GitHub Actions → writes public/nav-data.json → redeployed as a same-origin static file (no CORS).
//
// Source: https://www.cmf.tn/valeurs-liquidatives-des-titres-opcvm — one .xlsx per business day covering every fund.
// File names are inconsistent (vl09092026.xlsx, valeurs_liquidatives_260828.xlsx, …) so we scrape the listing
// page and order links by the date in their text, never by guessing the file name.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFirstSheet } from './xlsx-lite.mjs';
import { TUNISIAN_FUNDS, normalizeFundName } from '../src/utils/tunisianFunds.js';

const LISTING_URL = 'https://www.cmf.tn/valeurs-liquidatives-des-titres-opcvm';
const MAX_FILES_TO_TRY = 3;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept-Language': 'fr-TN,fr;q=0.9,en;q=0.8',
};

const MONTHS = {
  JANVIER: 1, FEVRIER: 2, MARS: 3, AVRIL: 4, MAI: 5, JUIN: 6,
  JUILLET: 7, AOUT: 8, SEPTEMBRE: 9, OCTOBRE: 10, NOVEMBRE: 11, DECEMBRE: 12,
};

/** Listing page HTML → [{ url, navDate: 'YYYY-MM-DD' }], newest first. */
export function parseListing(html, baseUrl = LISTING_URL) {
  const out = [];
  // Each listing entry holds a title ("Valeurs liquidatives du 15 Septembre 2026") followed by its file link
  // (href may be unquoted). Split on the xlsx links and read the date from the text just before each one.
  const linkRe = /href\s*=\s*["']?([^"'\s>]+\.xlsx?)/gi;
  let lastEnd = 0;
  for (const m of html.matchAll(linkRe)) {
    const text = normalizeFundName(html.slice(lastEnd, m.index).replace(/<[^>]+>/g, ' '));
    lastEnd = m.index + m[0].length;
    const url = new URL(m[1].replace(/&amp;/g, '&'), baseUrl).href;
    const dates = [...text.matchAll(/(\d{1,2})\s+([A-Z]+)\s+(\d{4})/g)].filter(d => MONTHS[d[2]]);
    const d = dates.at(-1);
    if (!d) continue; // e.g. the duplicate nested <a> of the same entry — nothing between the two links
    const navDate = `${d[3]}-${String(MONTHS[d[2]]).padStart(2, '0')}-${d[1].padStart(2, '0')}`;
    if (!out.some(o => o.url === url)) out.push({ url, navDate });
  }
  return out.sort((a, b) => b.navDate.localeCompare(a.navDate));
}

/** CMF sheet rows → { slug: nav } for tracked funds found in the sheet. */
export function extractNavs(rows, funds = TUNISIAN_FUNDS) {
  const header = rows.find(r => r.some(c => typeof c === 'string' && /DERNIERE VL/.test(normalizeFundName(c))));
  const col = (re) => header ? header.findIndex(c => typeof c === 'string' && re.test(normalizeFundName(c))) : -1;
  const lastCol = col(/DERNIERE VL/);
  const prevCol = col(/VL ANTERIEURE/);
  if (lastCol < 0) throw new Error('"Dernière VL" column not found — CMF sheet layout changed');

  const wanted = new Map(funds.map(f => [normalizeFundName(f.cmfName), f.slug]));
  const navs = {};
  for (const row of rows) {
    const nameCell = row.slice(0, 4).find(c => typeof c === 'string' && wanted.has(normalizeFundName(c)));
    if (!nameCell) continue;
    const nav = row[lastCol];
    if (typeof nav !== 'number' || !(nav > 0)) continue;
    const prev = prevCol >= 0 ? row[prevCol] : null;
    // Guard against a shifted column: a daily NAV move beyond ±25% is not credible.
    if (typeof prev === 'number' && prev > 0 && Math.abs(nav / prev - 1) > 0.25) continue;
    navs[wanted.get(normalizeFundName(nameCell))] = nav;
  }
  return navs;
}

async function get(url, as) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error(`${url}: ${lastErr.message}`);
}

async function main() {
  const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'nav-data.json');
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch (_) {}

  const files = parseListing(await get(LISTING_URL, 'text'));
  if (!files.length) throw new Error('No NAV files found on CMF listing page — page layout changed?');

  // Newest file wins per fund; older files only fill funds missing from newer ones.
  const found = {};
  for (const file of files.slice(0, MAX_FILES_TO_TRY)) {
    if (TUNISIAN_FUNDS.every(f => found[f.slug])) break;
    try {
      const navs = extractNavs(readFirstSheet(await get(file.url, 'buffer')));
      console.log(`${file.navDate} ${file.url} → ${Object.keys(navs).length} tracked funds`);
      for (const [slug, nav] of Object.entries(navs)) found[slug] ??= { nav, navDate: file.navDate };
    } catch (e) {
      console.log(`::warning::${file.navDate} ${file.url} unreadable: ${e.message}`);
    }
  }

  const now = new Date().toISOString();
  const result = {};
  for (const f of TUNISIAN_FUNDS) {
    const hit = found[f.slug];
    const prev = existing[f.slug];
    if (!hit) {
      console.log(`::warning::${f.label}: not found in recent CMF files${prev ? ' — keeping cached value' : ''}`);
      if (prev) result[f.slug] = prev;
      continue;
    }
    const unchanged = prev && prev.nav === hit.nav && prev.navDate === hit.navDate;
    // Keep fetchedAt stable when nothing changed so re-runs don't produce noise commits.
    result[f.slug] = { nav: hit.nav, navDate: hit.navDate, fetchedAt: unchanged ? prev.fetchedAt : now };
    console.log(`  ${f.label.padEnd(32)} ${String(hit.nav).padStart(10)}  (VL du ${hit.navDate})`);
  }

  if (!Object.keys(found).length) throw new Error('No tracked fund NAV could be read from CMF');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
  console.log(`Done: ${Object.keys(found).length}/${TUNISIAN_FUNDS.length} funds → ${outPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
}
