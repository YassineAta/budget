/**
 * Spending Insights — behaviour analytics over the append-only expense ledger.
 *
 * The ledger (`state.monthly.expenses`) retains every expense across all months,
 * each stamped with an ISO `date`. All month bucketing here uses the UTC month
 * key (`date.slice(0, 7)` → "YYYY-MM") to stay consistent with the rest of the
 * app (resetDate, applyDueExpenses all key off the same UTC slice).
 *
 * Everything is pure and deterministic given an explicit `asOf`, so it is
 * straightforward to unit-test and safe to call on every render.
 */

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** UTC month key ("YYYY-MM") for an ISO string or Date. */
export function monthKey(date) {
  if (typeof date === 'string') return date.slice(0, 7);
  return new Date(date).toISOString().slice(0, 7);
}

/** Keyword → category rules. First match wins; falls back to Bills (if the
 *  entry is a recurring cut) or Other. */
const CATEGORY_RULES = [
  { category: 'Groceries', keywords: ['grocer', 'food', 'market', 'supermarket', 'veg', 'butcher'] },
  { category: 'Transport', keywords: ['transport', 'fuel', 'gas', 'petrol', 'taxi', 'bus', 'metro', 'uber', 'train', 'car', 'parking'] },
  { category: 'Coffee', keywords: ['coffee', 'cafe', 'café', 'starbucks', 'tea', 'latte'] },
  { category: 'Pharmacy', keywords: ['pharmac', 'medic', 'drug', 'clinic', 'doctor', 'dental'] },
  { category: 'Bills', keywords: ['gym', 'internet', ' net', 'net ', 'rent', 'subscription', 'membership', 'phone', 'mobile', 'electric', 'water', 'insurance'] },
];

/** Classify a single expense into a spending category. */
export function categorize(expense) {
  const name = (expense?.name || '').toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => name.includes(k.trim()))) return rule.category;
  }
  if (expense?.isRecurring) return 'Bills';
  return 'Other';
}

/**
 * Goal purchases (`isPurchase`) stay in the ledger for history but are paid from
 * goal savings, not the monthly budget — they are never "spending" for analytics.
 * Same rule as `monthly.spent` (reducers/index.js).
 */
const isSpend = (e) => !!e && !e.isPurchase && typeof e.date === 'string';

/** Bucket expenses by UTC month → { month, total, count, items }. */
export function groupByMonth(expenses = []) {
  const map = {};
  for (const e of expenses) {
    if (!isSpend(e)) continue;
    const k = e.date.slice(0, 7);
    if (!map[k]) map[k] = { month: k, total: 0, count: 0, items: [] };
    map[k].total = round2(map[k].total + (Number(e.amount) || 0));
    map[k].count += 1;
    map[k].items.push(e);
  }
  return map;
}

/**
 * Contiguous per-month series for the last `nMonths` calendar months ending at
 * the month of `asOf` (inclusive). Months with no spending are included as
 * zeros so charts show a continuous timeline. Month keys are derived by integer
 * arithmetic on the UTC (year, month) to avoid any timezone/DST drift.
 */
export function getMonthlySeries(expenses = [], nMonths = 6, asOf = new Date()) {
  const groups = groupByMonth(expenses);
  const ref = new Date(asOf);
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const series = [];
  for (let i = nMonths - 1; i >= 0; i--) {
    let mm = m - i;
    let yy = y;
    while (mm < 0) { mm += 12; yy -= 1; }
    const key = `${yy}-${String(mm + 1).padStart(2, '0')}`;
    series.push({ month: key, total: groups[key]?.total || 0, count: groups[key]?.count || 0 });
  }
  return series;
}

/**
 * Learned monthly burn: the average spend across the last `window` COMPLETED
 * months (the current, partial month is excluded). Months with no data are
 * skipped so a new user isn't dragged toward zero. Returns null when there is
 * no completed-month history yet.
 */
export function getLearnedMonthlyBurn(expenses, opts = {}) {
  const { window = 3, asOf = new Date() } = opts;
  const series = getMonthlySeries(expenses, window + 1, asOf); // +1 for the current month
  const prior = series.slice(0, -1).filter(s => s.count > 0);
  if (prior.length === 0) return null;
  return round2(prior.reduce((s, x) => s + x.total, 0) / prior.length);
}

/**
 * Recency-weighted monthly burn: a weighted average of spend across the last
 * `window` COMPLETED months (the current, partial month is excluded). The most
 * recent completed month carries the most weight; older months decay
 * geometrically by `decay` (0.5 → each month counts half as much as the newer
 * one after it). Weights are normalised over whatever completed months actually
 * have data, so a user with only one month of history isn't dragged toward zero.
 * Returns null when there is no completed-month history yet.
 *
 * With the defaults (window 4, decay 0.5) a full history weights the months
 * roughly 53 / 27 / 13 / 7 % from newest to oldest — a projection that follows
 * recent behaviour without over-reacting to a single unusual month.
 */
export function getWeightedMonthlyBurn(expenses, opts = {}) {
  const { window = 4, decay = 0.5, asOf = new Date() } = opts;
  const series = getMonthlySeries(expenses, window + 1, asOf); // +1 for the current (excluded) month
  const prior = series.slice(0, -1).filter(s => s.count > 0);  // completed months with data, oldest→newest
  if (prior.length === 0) return null;
  let weightSum = 0;
  let acc = 0;
  // Walk newest→oldest so the latest completed month gets weight decay^0 = 1.
  for (let i = 0; i < prior.length; i++) {
    const s = prior[prior.length - 1 - i];
    const w = Math.pow(decay, i);
    acc += s.total * w;
    weightSum += w;
  }
  return round2(acc / weightSum);
}

/** Month-over-month change from the last two entries of a series. */
export function getMonthOverMonth(series) {
  if (!series || series.length < 2) return null;
  const current = series[series.length - 1].total;
  const previous = series[series.length - 2].total;
  const delta = round2(current - previous);
  const pct = previous > 0 ? round2((delta / previous) * 100) : null;
  return { current, previous, delta, pct };
}

/**
 * Pace signal: prorate the current (partial) month's spend to a full-month
 * projection based on elapsed days, then compare to the learned burn (or the
 * survival budget as a fallback). Drives the "you're X% below/above your usual
 * pace" callout.
 */
export function getPaceSignal(expenses, opts = {}) {
  const { asOf = new Date(), budget = 0 } = opts;
  const now = new Date(asOf);
  const currentKey = now.toISOString().slice(0, 7);
  const groups = groupByMonth(expenses);
  const spentThisMonth = groups[currentKey]?.total || 0;

  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const elapsedFraction = daysInMonth > 0 ? dayOfMonth / daysInMonth : 1;
  const projectedMonthEnd = elapsedFraction > 0 ? round2(spentThisMonth / elapsedFraction) : spentThisMonth;

  const learned = getLearnedMonthlyBurn(expenses, { asOf });
  const baseline = learned != null ? learned : (budget || 0);

  let pct = null;
  let status = 'unknown';
  if (baseline > 0) {
    pct = round2(((projectedMonthEnd - baseline) / baseline) * 100);
    status = pct <= -10 ? 'below' : pct >= 10 ? 'above' : 'on_track';
  }
  return {
    spentThisMonth: round2(spentThisMonth),
    projectedMonthEnd,
    baseline: round2(baseline),
    elapsedFraction: round2(elapsedFraction),
    pct,
    status,
  };
}

/** Category totals for a single month (defaults to the month of `asOf`). */
export function getCategoryBreakdown(expenses, opts = {}) {
  const { month = null, asOf = new Date() } = opts;
  const key = month || new Date(asOf).toISOString().slice(0, 7);
  const map = {};
  for (const e of expenses) {
    if (!isSpend(e) || e.date.slice(0, 7) !== key) continue;
    const cat = categorize(e);
    if (!map[cat]) map[cat] = { category: cat, total: 0, count: 0 };
    map[cat].total = round2(map[cat].total + (Number(e.amount) || 0));
    map[cat].count += 1;
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
}

/**
 * Per-category anomalies: compare this month's category spend against the
 * per-month average across prior months with data. Flags categories whose
 * spend deviates by more than `threshold` (fraction). Categories that are
 * trivial in both current and baseline (< minAmount) are ignored as noise.
 */
export function getAnomalies(expenses, opts = {}) {
  const { asOf = new Date(), window = 3, threshold = 0.3, minAmount = 10 } = opts;
  const currentKey = new Date(asOf).toISOString().slice(0, 7);
  const series = getMonthlySeries(expenses, window + 1, asOf);
  const priorKeys = new Set(series.slice(0, -1).filter(s => s.count > 0).map(s => s.month));
  const priorMonthCount = priorKeys.size;
  if (priorMonthCount === 0) return [];

  const currentByCat = {};
  const priorSumByCat = {};
  for (const e of expenses) {
    if (!isSpend(e)) continue;
    const k = e.date.slice(0, 7);
    const amt = Number(e.amount) || 0;
    const cat = categorize(e);
    if (k === currentKey) currentByCat[cat] = (currentByCat[cat] || 0) + amt;
    else if (priorKeys.has(k)) priorSumByCat[cat] = (priorSumByCat[cat] || 0) + amt;
  }

  const cats = new Set([...Object.keys(currentByCat), ...Object.keys(priorSumByCat)]);
  const anomalies = [];
  for (const cat of cats) {
    const current = round2(currentByCat[cat] || 0);
    const average = round2((priorSumByCat[cat] || 0) / priorMonthCount);
    if (current < minAmount && average < minAmount) continue;
    const base = average > 0 ? average : minAmount;
    const pct = round2(((current - base) / base) * 100);
    if (Math.abs(pct) >= threshold * 100) {
      anomalies.push({ category: cat, current, average, pct, direction: pct > 0 ? 'up' : 'down' });
    }
  }
  return anomalies.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}

/** June (5), July (6), August (7), September (8) are summer; the rest is school
 *  year. September is included because spending stays in summer mode into Sep. */
function isSummerMonth(monthIndex) {
  return monthIndex >= 5 && monthIndex <= 8;
}

/**
 * Historical per-season burn averages with Bayesian blending.
 *
 * Splits completed months into "summer" (Jun–Sep) and "school" (Oct–May)
 * buckets. When prior-year `historicalSeasons` seed data is provided it acts as
 * an informed prior, growth-adjusted by `growthRate` (inflation + income lift).
 *
 * Blend formula — empirical Bayes with prior strength 2:
 *   estimate = (n × avg_current + 2 × adjusted_prior) / (n + 2)
 *
 * Behaviour at key values of n (current-year school months logged):
 *   n=0 → 100% adjusted prior  (pure historical, before school starts)
 *   n=2 → 50 / 50 blend
 *   n=6 → 75% current actuals  (prior almost fully displaced)
 *
 * Returns { summer, school } — null when no data of any kind exists for that
 * season (e.g. no summer history and no summer seed data).
 */
export function getSeasonalBurn(expenses, opts = {}) {
  const { asOf = new Date(), historicalSeasons = [], growthRate = 0 } = opts;
  const currentKey = new Date(asOf).toISOString().slice(0, 7);
  const groups = groupByMonth(expenses);

  const summerCurrent = [], summerHistorical = [];
  const schoolCurrent = [], schoolHistorical = [];

  // Live ledger: completed months only (current partial month excluded).
  for (const [key, grp] of Object.entries(groups)) {
    if (key >= currentKey || grp.count === 0) continue;
    const monthIndex = parseInt(key.slice(5, 7), 10) - 1;
    if (isSummerMonth(monthIndex)) summerCurrent.push(grp.total);
    else schoolCurrent.push(grp.total);
  }

  // Prior-year seed entries (raw totals; growth adjustment applied below).
  for (const entry of historicalSeasons) {
    if (!entry?.month || entry.month >= currentKey) continue;
    const monthIndex = parseInt(entry.month.slice(5, 7), 10) - 1;
    if (isSummerMonth(monthIndex)) summerHistorical.push(entry.total);
    else schoolHistorical.push(entry.total);
  }

  // Bayesian blend: prior counts as PRIOR_STRENGTH pseudo-observations so that
  // the posterior shifts smoothly toward current actuals as data accumulates.
  // Set to 6 (matching the number of seeded historical months) so that a single
  // anomalous school month (e.g. high May end-of-year spending) can't dominate
  // the estimate — the historical baseline stays influential until ~6 real months
  // of this year's school data have been logged.
  const PRIOR_STRENGTH = 6;

  function blend(current, historical) {
    const histAdj = historical.map(v => v * (1 + growthRate));
    const histAvg = histAdj.length > 0
      ? histAdj.reduce((s, x) => s + x, 0) / histAdj.length
      : null;

    if (histAvg === null && current.length === 0) return null;
    if (histAvg === null) return round2(current.reduce((s, x) => s + x, 0) / current.length);
    if (current.length === 0) return round2(histAvg);

    const n = current.length;
    const currentAvg = current.reduce((s, x) => s + x, 0) / n;
    return round2((n * currentAvg + PRIOR_STRENGTH * histAvg) / (n + PRIOR_STRENGTH));
  }

  return {
    summer: blend(summerCurrent, summerHistorical),
    school: blend(schoolCurrent, schoolHistorical),
  };
}

/**
 * Forward-projected total burn for the next `months` calendar months (starting
 * from the month AFTER `asOf`). Each upcoming month's predicted spend uses:
 *   1. Seasonal avg for that season (summer or school) — when ≥2 historical
 *      months of that season exist in the ledger.
 *   2. Recency-weighted avg — fallback when no seasonal data yet.
 *   3. `fallback` value — when there is no completed-month history at all.
 *
 * Summing month-by-month (not flat_rate × months) means a season flip in the
 * upcoming window is reflected immediately: if the next 3 months are school
 * months, the target uses school-year spending even if the user is currently
 * in a high-spend summer — and vice versa.
 */
export function getProjectedBurnForPeriod(expenses, months, opts = {}) {
  const { asOf = new Date(), fallback = 0, historicalSeasons = [], growthRate = 0 } = opts;
  const seasonal = getSeasonalBurn(expenses, { asOf, historicalSeasons, growthRate });
  const recency = getWeightedMonthlyBurn(expenses, { asOf });

  const ref = new Date(asOf);
  let total = 0;

  for (let i = 1; i <= months; i++) {
    let m = ref.getUTCMonth() + i;
    let y = ref.getUTCFullYear();
    while (m > 11) { m -= 12; y += 1; }

    const seasonAvg = isSummerMonth(m) ? seasonal.summer : seasonal.school;
    total += seasonAvg ?? recency ?? fallback;
  }

  return round2(total);
}

/**
 * Month-by-month seasonal runway simulation.
 *
 * Projects how long `bufferAmount` lasts by consuming each upcoming calendar
 * month at its predicted burn rate:
 *   seasonal avg (summer or school-year) › recency-weighted avg › declaredMonthly
 *
 * Unlike simulateRunout + burnOverride this is a PURE monthly-rate simulation —
 * no recurring events scheduled separately — so there is no double-counting.
 * The partial remaining days of the current month are prorated.
 *
 * Returns the projected depletion Date, or null when the buffer survives the
 * full maxMonths look-ahead.
 */
export function getSeasonalRunoutDate(bufferAmount, expenses, declaredMonthly, opts = {}) {
  const { asOf = new Date(), maxMonths = 24, historicalSeasons = [], growthRate = 0 } = opts;
  if (!bufferAmount || bufferAmount <= 0) return new Date(asOf);

  const seasonal = getSeasonalBurn(expenses, { asOf, historicalSeasons, growthRate });
  const recency  = getWeightedMonthlyBurn(expenses, { asOf });

  let remaining = bufferAmount;
  const ref = new Date(asOf);

  // Prorate the remainder of the current (partial) month.
  const daysInCur   = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0)).getUTCDate();
  const dayOfMonth  = ref.getUTCDate();
  const curFraction = (daysInCur - dayOfMonth) / daysInCur;
  const curSeasonAvg = isSummerMonth(ref.getUTCMonth()) ? seasonal.summer : seasonal.school;
  const curBurn     = curSeasonAvg ?? recency ?? declaredMonthly;
  const partialBurn = curBurn * curFraction;

  if (remaining <= partialBurn) {
    const daysLeft = Math.ceil((remaining / curBurn) * daysInCur);
    return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), dayOfMonth + daysLeft));
  }
  remaining -= partialBurn;

  // Full future months: each month gets its own seasonal rate.
  for (let i = 1; i <= maxMonths; i++) {
    let m = ref.getUTCMonth() + i;
    let y = ref.getUTCFullYear();
    while (m > 11) { m -= 12; y += 1; }

    const seasonAvg = isSummerMonth(m) ? seasonal.summer : seasonal.school;
    const monthBurn = seasonAvg ?? recency ?? declaredMonthly;
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

    if (remaining <= monthBurn) {
      const dayOfRunout = Math.min(Math.ceil((remaining / monthBurn) * daysInMonth), daysInMonth);
      return new Date(Date.UTC(y, m, dayOfRunout));
    }
    remaining -= monthBurn;
  }

  return null;
}

/** One-shot bundle for the UI. */
export function getSpendingInsights(state, asOf = new Date(), months = 6) {
  const expenses = state?.monthly?.expenses || [];
  const budget = state?.monthly?.budget || 0;
  const series = getMonthlySeries(expenses, months, asOf);
  return {
    series,
    mom: getMonthOverMonth(series),
    learnedBurn: getLearnedMonthlyBurn(expenses, { asOf }),
    weightedBurn: getWeightedMonthlyBurn(expenses, { asOf }),
    pace: getPaceSignal(expenses, { asOf, budget }),
    categories: getCategoryBreakdown(expenses, { asOf }),
    anomalies: getAnomalies(expenses, { asOf }),
    hasHistory: series.some(s => s.count > 0),
  };
}
