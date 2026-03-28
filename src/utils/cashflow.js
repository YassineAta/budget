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

  let totalDrain = 0;
  let hasChanges = false;
  const updatedExpenses = expenses.map(exp => {
    const cuts = getPendingCuts(exp, asOf);
    if (cuts.length === 0) return exp;
    hasChanges = true;
    totalDrain += r2(exp.amount * cuts.length);
    // Advance last_applied_date to the date of the last cut (not "now"), so
    // the next call correctly identifies the next cut date.
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

  return { ...state, goals: updatedGoals, recurringExpenses: updatedExpenses };
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
 * Project what the buffer balance will be after `days` days, accounting only
 * for scheduled recurring cuts (not manual one-time expenses).
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
  for (const event of getFutureEvents(state, days, asOf)) {
    balance -= event.amount;
  }
  return r2(Math.max(0, balance));
}

/**
 * Simulate forward in time to find the date the buffer will reach 0 based
 * solely on scheduled recurring cuts. Returns null if the buffer won't be
 * depleted within `maxDays`.
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
  for (const event of getFutureEvents(state, maxDays, asOf)) {
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
