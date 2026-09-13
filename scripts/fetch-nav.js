#!/usr/bin/env node
// Fetches daily NAV for Tunisian SICAV/FCP funds from millim.tn (server-side, no CORS).
// Run by GitHub Actions → commits result to public/nav-data.json → served as static file.

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MILLIM_BASE = 'https://www.millim.tn/fund/';
const ILBOURSA_BASE = 'https://www.ilboursa.com/opcvm/';

// All funds with known millim.tn slugs
const FUNDS = [
  { slug: 'attijari-fcp-dynamique_TNILB0000033',            millimSlug: 'attijari-gestion-attijari-fcp-dynamique' },
  { slug: 'poste-obligataire-sicav-tanit_TNILB0000044',     millimSlug: 'bh-invest-poste-obligataire-sicav-tanit' },
  { slug: 'attijari-fcp-cea_TNILB0000035',                  millimSlug: 'attijari-gestion-attijari-fcp-cea' },
  { slug: 'attijari-obligataire-sicav_TNILB0000034',        millimSlug: 'attijari-gestion-attijari-obligataire-sicav' },
  { slug: 'fcp-bh-cea_TNILB0000045',                        millimSlug: 'bh-invest-fcp-bh-cea' },
  { slug: 'fcp-cea-maxula_TNILB0000038',                    millimSlug: 'maxula-bourse-fcp-cea-maxula' },
  { slug: 'fcp-delta-epargne-actions_TNILB0000059',         millimSlug: 'stb-finance-fcp-delta-epargne-actions' },
  { slug: 'fcp-ilboursa-cea_TNILB0000099',                  millimSlug: 'mac-sa-fcp-ilboursa-cea' },
  { slug: 'fcp-valeurs-cea_TNILB0000004',                   millimSlug: 'tunisie-valeurs-asset-management-fcp-valeurs-cea' },
  { slug: 'mac-croissance-fcp_TNILB0000020',                millimSlug: 'mac-sa-mac-croissance-fcp' },
  { slug: 'mcp-cea-fund_TNILB0000077',                      millimSlug: 'mena-capital-partners-mcp-cea-fund' },
];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'fr-TN,fr;q=0.9,en;q=0.8',
};

function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: BROWSER_HEADERS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseNav(html, source) {
  const patterns = [
    // millim.tn: JSON blob (Next.js __NEXT_DATA__ or inline)
    /"nav"\s*:\s*([\d.]+)/i,
    /"vl"\s*:\s*([\d.]+)/i,
    // millim.tn: number directly adjacent to TND in HTML
    /([\d]+\.[\d]{2,4})(?=[^,\d]{0,60}TND)/,
    // ilboursa.com: French format after VALEUR LIQUIDATIVE heading
    /VALEUR LIQUIDATIVE[\s\S]{0,600}?(\d[\d\s]*,\d+)/,
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) {
      const nav = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
      if (Number.isFinite(nav) && nav > 0 && nav < 100000) {
        console.log(`    matched via ${pat.source.slice(0, 30)}… = ${nav}`);
        return nav;
      }
    }
  }
  return null;
}

async function fetchFundNav(fund) {
  // Try millim.tn first
  if (fund.millimSlug) {
    try {
      const url = `${MILLIM_BASE}${fund.millimSlug}/`;
      const html = await fetchUrl(url);
      const nav = parseNav(html, 'millim');
      if (nav !== null) return { nav, source: 'millim' };
      throw new Error('pattern not found');
    } catch (e) {
      console.log(`    millim failed: ${e.message}`);
    }
  }
  // Fall back to ilboursa.com
  const url = `${ILBOURSA_BASE}${fund.slug}`;
  const html = await fetchUrl(url);
  const nav = parseNav(html, 'ilboursa');
  if (nav !== null) return { nav, source: 'ilboursa' };
  throw new Error('NAV not found on either source');
}

async function main() {
  const outPath = path.join(__dirname, '..', 'public', 'nav-data.json');
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch (_) {}

  const now = new Date().toISOString();
  const results = { ...existing };
  let updated = 0;

  for (const fund of FUNDS) {
    process.stdout.write(`Fetching ${fund.slug}… `);
    try {
      const { nav, source } = await fetchFundNav(fund);
      results[fund.slug] = { nav, fetchedAt: now };
      console.log(`${nav} TND (${source})`);
      updated++;
    } catch (e) {
      console.log(`FAILED: ${e.message} — keeping cached value`);
    }
    // Small delay to avoid rate-limiting
    await new Promise(r => setTimeout(r, 500));
  }

  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nDone: ${updated}/${FUNDS.length} updated → ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
