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
  const needs = state.monthly?.budget || 200;
  const recurring = (state.recurringExpenses || [])
    .filter(e => e.active)
    .reduce((s, e) => s + normalizeToMonthly(e), 0);
  return needs + recurring;
}

export function getMonthlySaving(goal) {
  if (!goal.targetDate || goal.saved >= goal.target) return null;
  const now = new Date();
  const curY = now.getUTCFullYear();
  const curM = now.getUTCMonth();
  const [tYear, tMonth] = goal.targetDate.split('-');
  const tY = parseInt(tYear, 10);
  const tM = parseInt(tMonth, 10) - 1;

  const monthsDiff = (tY - curY) * 12 + (tM - curM);

  if (monthsDiff < 0) {
    return { needed: goal.target - goal.saved, months: 0, status: 'overdue' };
  }

  if (monthsDiff === 0) {
    return { needed: goal.target - goal.saved, months: 0, status: 'due-now' };
  }

  const installments = monthsDiff + 1;
  return { needed: Math.ceil((goal.target - goal.saved) / installments), months: installments, status: 'active' };
}

export function formatTargetDate(dateStr) {
  if (!dateStr) return '';
  const [year, month] = dateStr.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
