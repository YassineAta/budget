export { uid } from './uid';
import { normalizeToMonthly } from './cashflow';
import { getProjectedBurnForPeriod } from './spendingInsights';


/**
 * Calculate the safety buffer's target amount — forward-projected and seasonal.
 *
 * Rather than extrapolating a flat burn rate (rate × months), this sums the
 * predicted spend for each of the UPCOMING safetyMonths calendar months:
 *   per-month prediction = seasonal avg (summer or school-year) › recency-
 *                          weighted avg › declared essentials floor
 *
 * This means a season flip in the upcoming window is reflected immediately: if
 * the next 3 months are school months the target uses school-year spending even
 * if the user is currently in a high-spend summer — eliminating the 3-4 month
 * lag of the old backward-looking approach and giving an accurate "safe until"
 * date. The declared-essentials floor (per month × safetyMonths) prevents the
 * buffer from ever dropping below stated survival needs.
 */
export function calculateBufferTarget(state) {
  const declared = monthlyEssentials(state);
  const expenses = state.monthly?.expenses || [];
  const months = state.safetyMonths || 3;
  const historicalSeasons = state.historicalSeasons || [];
  const growthRate = state.historicalGrowthRate ?? 0;
  const projected = getProjectedBurnForPeriod(expenses, months, {
    fallback: declared, historicalSeasons, growthRate,
  });
  return Math.max(projected, declared * months);
}

/**
 * Total monthly essential spending: survival budget + active recurring costs.
 * Used for buffer level calculations and income allocation.
 */
export function monthlyEssentials(state) {
  // A declared budget of 0 is legitimate (recurring-only user) — only fall back
  // to the 200 default when the field is genuinely absent / non-finite.
  const needs = Number.isFinite(state.monthly?.budget) ? state.monthly.budget : 200;
  const recurring = (state.recurringExpenses || [])
    .filter(e => e.active)
    .reduce((s, e) => s + normalizeToMonthly(e), 0);
  return needs + recurring;
}

const MS_PER_DAY = 86_400_000;

/** True when a stored targetDate carries an explicit day (YYYY-MM-DD). */
function hasDayComponent(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const parts = dateStr.split('-');
  return parts.length >= 3 && parts[2] !== '' && Number.isFinite(parseInt(parts[2], 10));
}

/**
 * Parse a goal target date into a UTC-midnight Date, accepting BOTH the new
 * day-level format (YYYY-MM-DD) and legacy month-only values (YYYY-MM). A
 * legacy month is treated as the LAST day of that month — the most forgiving
 * interpretation of "by <month>", and it preserves the pre-day-precision
 * behaviour (the goal stays "due this month" for the whole month).
 *
 * Returns null for empty / malformed input.
 */
export function parseGoalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  if (hasDayComponent(dateStr)) {
    return new Date(Date.UTC(y, m - 1, parseInt(parts[2], 10)));
  }
  // Month-only → last calendar day of that month (day 0 of the next month).
  return new Date(Date.UTC(y, m, 0));
}

/** Today at UTC midnight — the reference point for day-accurate comparisons. */
function utcToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Day-accurate savings plan for a dated goal. Returns:
 *   { needed, months, days, status }
 *   - status: 'overdue' | 'due-now' | 'active'
 *   - days:   whole days until the deadline (negative when overdue)
 *   - months: number of monthly contribution slots (installments)
 *   - needed: amount to set aside per slot to hit the target on time
 *
 * The allocator relies on `status`, `months` and `needed`; `days` is additive
 * for the UI countdown. Returns null for undated or already-funded goals.
 */
export function getMonthlySaving(goal) {
  if (!goal.targetDate || goal.saved >= goal.target) return null;
  const target = parseGoalDate(goal.targetDate);
  if (!target) return null;

  const today = utcToday();
  const remaining = goal.target - goal.saved;
  const days = Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);

  if (days < 0) {
    return { needed: remaining, months: 0, days, status: 'overdue' };
  }

  // Whole-month distance between today's month and the deadline's month.
  const monthsDiff = (target.getUTCFullYear() - today.getUTCFullYear()) * 12
                   + (target.getUTCMonth() - today.getUTCMonth());

  if (monthsDiff <= 0) {
    // Deadline is later this month (or today) → fund it fully now.
    return { needed: remaining, months: 0, days, status: 'due-now' };
  }

  const installments = monthsDiff + 1;
  return { needed: Math.ceil(remaining / installments), months: installments, days, status: 'active' };
}

/**
 * Normalise any stored targetDate to a YYYY-MM-DD value for `<input type="date">`.
 * Legacy month-only goals resolve to their effective deadline (end of month) so
 * editing them doesn't silently move the date earlier.
 */
export function toDateInputValue(dateStr) {
  const d = parseGoalDate(dateStr);
  return d ? d.toISOString().slice(0, 10) : '';
}

export function formatTargetDate(dateStr) {
  const date = parseGoalDate(dateStr);
  if (!date) return '';
  // Format from the UTC parts so a UTC-midnight date never renders as the prior
  // day in negative-offset timezones.
  return date.toLocaleDateString(undefined, hasDayComponent(dateStr)
    ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
    : { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
