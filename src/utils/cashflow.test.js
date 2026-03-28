import { describe, it, expect } from 'vitest';
import { getPendingCuts, applyDueExpenses, normalizeToMonthly, projectBalance, simulateRunout, PERIOD_DAYS } from './cashflow';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a date string N days ago */
function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

/** Build a date string N days in the future */
function daysAhead(n) {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

/** Make a monthly recurring expense with a specific cut_day and optional last_applied_date */
function monthly(amount, cut_day, lastApplied = null) {
  const now = new Date().toISOString();
  return {
    id: 'r1', name: 'Test', amount, period: 'monthly', active: true,
    cut_day,
    start_date: lastApplied || now,
    last_applied_date: lastApplied || now,
  };
}

function weekly(amount, lastApplied = null) {
  const now = new Date().toISOString();
  return {
    id: 'r2', name: 'Weekly', amount, period: 'weekly', active: true,
    cut_day: 1,
    start_date: lastApplied || now,
    last_applied_date: lastApplied || now,
  };
}

function makeState(bufferSaved, expenses = []) {
  return {
    goals: [{ id: 'buf', isBuffer: true, saved: bufferSaved }],
    recurringExpenses: expenses,
  };
}

// ── getPendingCuts ────────────────────────────────────────────────────────────

describe('getPendingCuts', () => {
  it('returns [] for an inactive expense', () => {
    const exp = { ...monthly(70, 1, daysAgo(40)), active: false };
    expect(getPendingCuts(exp, new Date().toISOString())).toHaveLength(0);
  });

  it('returns [] when cut_day has not yet passed this month', () => {
    // Set last_applied_date to last month, cut_day to day 28
    // If today is before day 28 this month, no cut yet
    const today = new Date();
    if (today.getDate() >= 28) return; // skip on days 28+
    const last = new Date(today.getFullYear(), today.getMonth() - 1, 28).toISOString();
    const exp = monthly(70, 28, last);
    expect(getPendingCuts(exp, new Date().toISOString())).toHaveLength(0);
  });

  it('returns 1 cut when cut_day has passed this month', () => {
    // Set last_applied_date to last month's cut_day so this month's hasn't applied
    const today = new Date();
    if (today.getDate() < 1) return; // shouldn't happen
    const cutDay = 1;
    const last = new Date(today.getFullYear(), today.getMonth() - 1, cutDay).toISOString();
    const exp = monthly(70, cutDay, last);
    const cuts = getPendingCuts(exp, new Date().toISOString());
    expect(cuts).toHaveLength(1);
    expect(cuts[0].getDate()).toBe(cutDay);
    expect(cuts[0].getMonth()).toBe(today.getMonth());
  });

  it('returns multiple cuts for missed months', () => {
    const today = new Date();
    // last applied 3 months ago on day 1
    const last = new Date(today.getFullYear(), today.getMonth() - 3, 1).toISOString();
    const exp = monthly(70, 1, last);
    const cuts = getPendingCuts(exp, new Date().toISOString());
    // Months: (today.month - 2), (today.month - 1), today.month — 3 cuts (if day 1 ≤ today's day)
    expect(cuts.length).toBeGreaterThanOrEqual(2);
  });

  it('clamps cut_day to end of shorter months (e.g. day 31 in February → Feb 28/29)', () => {
    // last applied Jan 31, cut_day = 31
    const last = new Date(2026, 0, 31).toISOString(); // Jan 31
    const asOf = new Date(2026, 1, 28, 12).toISOString(); // Feb 28 noon
    const exp = { ...monthly(50, 31, last) };
    const cuts = getPendingCuts(exp, asOf);
    expect(cuts).toHaveLength(1);
    // Should be clamped to Feb 28
    expect(cuts[0].getDate()).toBe(28);
    expect(cuts[0].getMonth()).toBe(1); // February
  });

  it('weekly: returns 1 cut after 7 days', () => {
    const last = daysAgo(8);
    const exp = weekly(35, last);
    const cuts = getPendingCuts(exp, new Date().toISOString());
    expect(cuts).toHaveLength(1);
  });

  it('weekly: returns 2 cuts after 14 days', () => {
    const last = daysAgo(15);
    const exp = weekly(35, last);
    const cuts = getPendingCuts(exp, new Date().toISOString());
    expect(cuts).toHaveLength(2);
  });

  it('weekly: returns 0 cuts when less than 7 days have passed', () => {
    const last = daysAgo(6);
    const exp = weekly(35, last);
    expect(getPendingCuts(exp, new Date().toISOString())).toHaveLength(0);
  });
});

// ── applyDueExpenses ──────────────────────────────────────────────────────────

describe('applyDueExpenses', () => {
  it('does not drain when no expenses have pending cuts', () => {
    // cut_day=1 and last_applied_date = today → no pending cuts
    const exp = monthly(70, 1);
    const state = makeState(1000, [exp]);
    const result = applyDueExpenses(state);
    expect(result.goals[0].saved).toBe(1000);
  });

  it('deducts one month worth when a single monthly cut is due', () => {
    const today = new Date();
    const last = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    const exp = monthly(70, 1, last);
    const state = makeState(1000, [exp]);
    const result = applyDueExpenses(state);
    // Exactly one cut: 70
    expect(result.goals[0].saved).toBe(930);
  });

  it('deducts multiple months when skipped', () => {
    const today = new Date();
    const last = new Date(today.getFullYear(), today.getMonth() - 3, 1).toISOString();
    const exp = monthly(70, 1, last);
    const state = makeState(1000, [exp]);
    const result = applyDueExpenses(state);
    // At least 2 cuts (could be 2 or 3 depending on today's date vs day 1)
    expect(result.goals[0].saved).toBeLessThan(1000 - 70);
  });

  it('advances last_applied_date to the date of the last cut', () => {
    const today = new Date();
    const last = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    const exp = monthly(70, 1, last);
    const state = makeState(1000, [exp]);
    const result = applyDueExpenses(state);
    const newDate = new Date(result.recurringExpenses[0].last_applied_date);
    // Should be day 1 of current month
    expect(newDate.getDate()).toBe(1);
    expect(newDate.getMonth()).toBe(today.getMonth());
  });

  it('is idempotent: calling twice does not double-count', () => {
    const today = new Date();
    const last = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    const exp = monthly(70, 1, last);
    const state = makeState(1000, [exp]);
    const once = applyDueExpenses(state);
    const twice = applyDueExpenses(once);
    expect(twice.goals[0].saved).toBe(once.goals[0].saved);
  });

  it('clamps buffer to 0 when drain exceeds balance', () => {
    const today = new Date();
    const last = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    const exp = monthly(9999, 1, last);
    const state = makeState(10, [exp]);
    const result = applyDueExpenses(state);
    expect(result.goals[0].saved).toBe(0);
  });

  it('does not drain for inactive expenses', () => {
    const today = new Date();
    const last = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    const exp = { ...monthly(70, 1, last), active: false };
    const state = makeState(1000, [exp]);
    const result = applyDueExpenses(state);
    expect(result.goals[0].saved).toBe(1000);
  });
});

// ── normalizeToMonthly ────────────────────────────────────────────────────────

describe('normalizeToMonthly', () => {
  it('returns monthly amount unchanged', () => {
    expect(normalizeToMonthly({ amount: 100, period: 'monthly' })).toBe(100);
  });

  it('converts weekly to monthly equivalent', () => {
    const weeksPerMonth = PERIOD_DAYS.monthly / PERIOD_DAYS.weekly;
    expect(normalizeToMonthly({ amount: 70, period: 'weekly' })).toBeCloseTo(70 * weeksPerMonth, 1);
  });
});

// ── projectBalance ────────────────────────────────────────────────────────────
// Uses fixed asOf dates so tests are deterministic regardless of when they run.

describe('projectBalance', () => {
  const asOf = new Date(2026, 0, 1); // Jan 1, 2026 at midnight

  it('returns buffer.saved when no active expenses', () => {
    const state = makeState(800, [{ ...monthly(70, 1), active: false }]);
    expect(projectBalance(state, 30, asOf)).toBe(800);
  });

  it('returns 0 when there is no buffer goal', () => {
    expect(projectBalance({ goals: [], recurringExpenses: [] }, 30, asOf)).toBe(0);
  });

  it('deducts one cut that falls within the 30-day window', () => {
    // asOf = Jan 1, cut_day = 15 → Jan 15 is within 30d → 1 cut of 100
    const exp = monthly(100, 15);
    const state = makeState(1000, [exp]);
    expect(projectBalance(state, 30, asOf)).toBe(900);
  });

  it('deducts two cuts that fall within a 60-day window', () => {
    // asOf = Jan 1, cut_day = 15 → Jan 15 and Feb 15 are within 60d
    const exp = monthly(100, 15);
    const state = makeState(1000, [exp]);
    expect(projectBalance(state, 60, asOf)).toBe(800);
  });

  it('returns 0 when projected drain exceeds balance', () => {
    const exp = monthly(9999, 15);
    const state = makeState(100, [exp]);
    expect(projectBalance(state, 30, asOf)).toBe(0);
  });
});

// ── simulateRunout ────────────────────────────────────────────────────────────

describe('simulateRunout', () => {
  const asOf = new Date(2026, 0, 1); // Jan 1, 2026

  it('returns null when no active recurring expenses', () => {
    const state = makeState(1000, []);
    expect(simulateRunout(state, 730, asOf)).toBeNull();
  });

  it('returns null when balance won\'t run out within maxDays', () => {
    // 10/month, 100_000 balance → not depleted in 730 days
    const exp = monthly(10, 15);
    const state = makeState(100_000, [exp]);
    expect(simulateRunout(state, 730, asOf)).toBeNull();
  });

  it('returns a future date when balance will be depleted', () => {
    // 200/month on day 15, balance 350 → runs out on Feb 15 (2nd cut)
    const exp = monthly(200, 15);
    const state = makeState(350, [exp]);
    const date = simulateRunout(state, 365, asOf);
    expect(date).toBeInstanceOf(Date);
    expect(date > asOf).toBe(true);
    // First cut: Jan 15 → 350-200=150 remaining
    // Second cut: Feb 15 → 150-200 < 0 → runout
    expect(date.getMonth()).toBe(1); // February
    expect(date.getDate()).toBe(15);
  });

  it('returns asOf when buffer is already at 0', () => {
    const state = makeState(0, [monthly(70, 1)]);
    const result = simulateRunout(state, 730, asOf);
    expect(result).toBeInstanceOf(Date);
    expect(+result).toBe(+asOf);
  });
});
