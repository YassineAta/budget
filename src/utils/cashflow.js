import { uid } from './uid';

/**
 * Cashflow Engine — discrete, scheduled recurring cuts
 *
 * Each recurring expense is deducted once per period on a specific day:
 *   - Monthly: on `cut_day` (1-31, clamped to actual days in month)
 *   - Weekly:  every 7 days from the last applied date
 *
 * The engine compares `last_applied_date` against the current date to
 * determine how many cuts are pending (handles missed months if the app
 * wasn't opened). It is idempotent — calling it twice in the same session
 * won't double-count because last_applied_date is advanced after each cut.
 */

/** Days per period, used for monthly normalisation (buffer target). */
export const PERIOD_DAYS = {
  monthly: 365.25 / 12, // ≈ 30.4375
  weekly: 7,
};

const MS_PER_DAY = 86_400_000;

/** Number of days in a given month (handles leap years). */
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function r2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Return all pending cut dates for `expense` between its last_applied_date
 * and `asOf`.
 *
 * For monthly expenses each cut falls on `cut_day` of its month (clamped to
 * the actual number of days in that month so e.g. day 31 in February → Feb 28).
 * For weekly expenses each cut is exactly 7 days after the previous one.
 *
 * @param {object} expense
 * @param {string|Date} asOf
 * @returns {Date[]} sorted ascending
 */
export function getPendingCuts(expense, asOf) {
  if (!expense.active) return [];

  const now = new Date(asOf);
  const lastApplied = new Date(expense.last_applied_date || expense.start_date);
  const cuts = [];

  if (expense.period === 'monthly') {
    const cutDay = expense.cut_day || 1;
    let year = lastApplied.getFullYear();
    let month = lastApplied.getMonth();

    // Build the first candidate cut date in the same month as lastApplied
    let day = Math.min(cutDay, getDaysInMonth(year, month));
    let candidate = new Date(year, month, day);

    // If that date is not strictly after lastApplied, advance to the next month
    if (candidate <= lastApplied) {
      month += 1;
      if (month > 11) { month = 0; year += 1; }
      day = Math.min(cutDay, getDaysInMonth(year, month));
      candidate = new Date(year, month, day);
    }

    // Collect all cuts up to and including now
    while (candidate <= now) {
      cuts.push(new Date(candidate));
      month += 1;
      if (month > 11) { month = 0; year += 1; }
      day = Math.min(cutDay, getDaysInMonth(year, month));
      candidate = new Date(year, month, day);
    }
  } else {
    // Weekly: every 7 days from lastApplied
    let nextCut = new Date(lastApplied.getTime() + 7 * MS_PER_DAY);
    while (nextCut <= now) {
      cuts.push(new Date(nextCut));
      nextCut = new Date(nextCut.getTime() + 7 * MS_PER_DAY);
    }
  }

  return cuts;
}

/**
 * Apply all due recurring expense cuts to state.
 *
 * Each expense may contribute multiple cuts (if periods were skipped while
 * the app was closed). The total drain across all expenses is deducted from
 * buffer.saved in one atomic operation so the buffer never dips below 0 from
 * partial deductions.
 *
 * Idempotent: if called again with the same `asOf`, elapsed = 0 → no cuts.
 *
 * @param {object} state
 * @param {string} [asOf] ISO timestamp (defaults to now)
 * @returns {object} new state
 */
export function applyDueExpenses(state, asOf = new Date().toISOString()) {
  const expenses = state.recurringExpenses || [];
  if (expenses.length === 0) return state;

  // Current billing month string e.g. "2026-04" — cuts on/after this count
  // toward this month's spent total. Earlier catch-up cuts are still logged
  // (with their real date) but don't inflate the current-month counter.
  const resetDate = state.monthly?.resetDate || new Date(asOf).toISOString().slice(0, 7);

  let totalDrain = 0;
  let thisMonthDrain = 0;
  let hasChanges = false;
  const newLedgerEntries = [];

  const updatedExpenses = expenses.map(exp => {
    const cuts = getPendingCuts(exp, asOf);
    if (cuts.length === 0) return exp;
    hasChanges = true;

    for (const cut of cuts) {
      totalDrain = r2(totalDrain + exp.amount);
      // Build a spending-log entry with the real cut date
      const cutIso = cut.toISOString();
      const cutMonth = cutIso.slice(0, 7);
      newLedgerEntries.push({
        id: uid(),
        name: exp.name,
        amount: exp.amount,
        date: cutIso,
        isRecurring: true,
        recurringId: exp.id,
      });
      // Only count toward this month's budget if the cut is in the current period
      if (cutMonth >= resetDate) {
        thisMonthDrain = r2(thisMonthDrain + exp.amount);
      }
    }

    // Advance last_applied_date to the date of the last cut (not "now")
    const lastCut = cuts[cuts.length - 1];
    return { ...exp, last_applied_date: lastCut.toISOString() };
  });

  // Nothing is due — return original state to avoid triggering a re-render.
  if (!hasChanges) return state;

  const updatedGoals = state.goals.map(g =>
    g.isBuffer
      ? { ...g, saved: r2(Math.max(0, g.saved - totalDrain)) }
      : g
  );

  // Append new entries to the monthly log and update spent counter
  const updatedMonthly = {
    ...state.monthly,
    spent: r2((state.monthly?.spent || 0) + thisMonthDrain),
    expenses: [
      ...(state.monthly?.expenses || []),
      ...newLedgerEntries,
    ],
  };

  return {
    ...state,
    goals: updatedGoals,
    recurringExpenses: updatedExpenses,
    monthly: updatedMonthly,
  };
}

/**
 * Build a sorted list of all future cut events within `days` from `asOf`.
 * Used by projectBalance and simulateRunout.
 *
 * @param {object} state
 * @param {number} days
 * @param {Date|string} [asOf] reference "now" (defaults to current time)
 * @returns {{ date: Date, amount: number, name: string }[]}
 */
export function getFutureEvents(state, days, asOf = new Date()) {
  const now = new Date(asOf);
  const end = new Date(now.getTime() + days * MS_PER_DAY);
  const events = [];

  for (const exp of (state.recurringExpenses || [])) {
    if (!exp.active) continue;

    if (exp.period === 'monthly') {
      const cutDay = exp.cut_day || 1;
      let year = now.getFullYear();
      let month = now.getMonth();
      let day = Math.min(cutDay, getDaysInMonth(year, month));
      let candidate = new Date(year, month, day);

      // If this month's cut date is today or in the past, advance to next month
      if (candidate <= now) {
        month += 1;
        if (month > 11) { month = 0; year += 1; }
        day = Math.min(cutDay, getDaysInMonth(year, month));
        candidate = new Date(year, month, day);
      }

      while (candidate <= end) {
        events.push({ date: new Date(candidate), amount: exp.amount, name: exp.name });
        month += 1;
        if (month > 11) { month = 0; year += 1; }
        day = Math.min(cutDay, getDaysInMonth(year, month));
        candidate = new Date(year, month, day);
      }
    } else {
      // Weekly
      let d = new Date(now.getTime() + 7 * MS_PER_DAY);
      while (d <= end) {
        events.push({ date: new Date(d), amount: exp.amount, name: exp.name });
        d = new Date(d.getTime() + 7 * MS_PER_DAY);
      }
    }
  }

  events.sort((a, b) => a.date - b.date);
  return events;
}

/**
 * Build a merged drain timeline: scheduled recurring cuts + monthly survival
 * spending. Time-aware: for the current month, only the unspent portion of
 * the survival budget is drained (at end-of-month); future months drain the
 * full survival budget on the 1st.
 *
 * @param {object} state
 * @param {number} days
 * @param {Date|string} [asOf]
 * @returns {{ date: Date, amount: number, name: string }[]}
 */
export function getProjectedDrains(state, days, asOf = new Date()) {
  const events = getFutureEvents(state, days, asOf).slice();
  const now = new Date(asOf);
  const end = new Date(now.getTime() + days * MS_PER_DAY);

  const survivalBudget = state.monthly?.budget || 0;
  if (survivalBudget > 0) {
    // Current month: drain the remaining (un-spent) survival at end of month
    const spentThisMonth = state.monthly?.spent || 0;
    const remainingThisMonth = Math.max(0, survivalBudget - spentThisMonth);
    const endOfThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 0);
    if (remainingThisMonth > 0 && endOfThisMonth > now && endOfThisMonth <= end) {
      events.push({ date: endOfThisMonth, amount: remainingThisMonth, name: 'Survival (this month)' });
    }

    // Future months: full survival drain on the 1st
    let y = now.getFullYear();
    let m = now.getMonth() + 1;
    if (m > 11) { m = 0; y += 1; }
    while (true) {
      const monthStart = new Date(y, m, 1, 0, 1, 0);
      if (monthStart > end) break;
      events.push({ date: monthStart, amount: survivalBudget, name: 'Monthly survival' });
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  }

  events.sort((a, b) => a.date - b.date);
  return events;
}

/**
 * Project what the buffer balance will be after `days` days, accounting for
 * scheduled recurring cuts AND the monthly survival budget.
 *
 * @param {object} state
 * @param {number} days
 * @param {Date|string} [asOf] reference "now" (defaults to current time)
 * @returns {number}
 */
export function projectBalance(state, days, asOf = new Date()) {
  const buffer = (state.goals || []).find(g => g.isBuffer);
  if (!buffer) return 0;

  let balance = buffer.saved;
  for (const event of getProjectedDrains(state, days, asOf)) {
    balance -= event.amount;
  }
  return r2(Math.max(0, balance));
}

/**
 * Simulate forward in time to find the date the buffer will reach 0, based on
 * scheduled recurring cuts AND the monthly survival budget. Returns null if
 * the buffer won't be depleted within `maxDays`.
 *
 * @param {object} state
 * @param {number} [maxDays=730] how far to simulate (default: 2 years)
 * @param {Date|string} [asOf] reference "now" (defaults to current time)
 * @returns {Date|null}
 */
export function simulateRunout(state, maxDays = 730, asOf = new Date()) {
  const buffer = (state.goals || []).find(g => g.isBuffer);
  if (!buffer) return null;
  if (buffer.saved <= 0) return new Date(asOf); // already depleted

  let balance = buffer.saved;
  for (const event of getProjectedDrains(state, maxDays, asOf)) {
    balance -= event.amount;
    if (balance <= 0) return event.date;
  }
  return null; // runway extends beyond maxDays
}

/**
 * Normalise a recurring expense amount to a monthly equivalent.
 * Used for buffer target calculations (always expressed in monthly units).
 *
 * @param {object} expense
 * @returns {number}
 */
export function normalizeToMonthly(expense) {
  if (expense.period === 'weekly') {
    return r2(expense.amount * (PERIOD_DAYS.monthly / PERIOD_DAYS.weekly));
  }
  return expense.amount;
}
