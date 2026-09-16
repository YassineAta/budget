// NAV source: public/nav-data.json — same-origin static file built from the official CMF daily
// NAV Excel by GitHub Actions (scripts/fetch-nav.mjs). No third-party CORS proxies.

let pending = null;

/** Fetches nav-data.json once per burst (concurrent callers share one request). */
function loadNavData() {
  if (!pending) {
    const base = import.meta.env?.BASE_URL ?? '/';
    pending = fetch(`${base}nav-data.json`, { cache: 'no-cache', signal: AbortSignal.timeout(10_000) })
      .then(res => {
        if (!res.ok) throw new Error(`nav-data.json HTTP ${res.status}`);
        return res.json();
      })
      .finally(() => { setTimeout(() => { pending = null; }, 5_000); });
  }
  return pending;
}

/** @returns {Promise<{ nav: number, navDate: string | null }>} */
export async function fetchNav(slug) {
  const data = await loadNavData();
  const entry = data[slug];
  if (!entry?.nav) throw new Error('fund not tracked in CMF data');
  return { nav: Number(entry.nav), navDate: entry.navDate ?? null };
}
