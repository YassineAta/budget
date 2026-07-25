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

/** Bucket expenses by UTC month → { month, total, count, items }. */
export function groupByMonth(expenses = []) {
  const map = {};
  for (const e of expenses) {
    if (!e || typeof e.date !== 'string') continue;
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
    if (!e || typeof e.date !== 'string' || e.date.slice(0, 7) !== key) continue;
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
    if (!e || typeof e.date !== 'string') continue;
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
