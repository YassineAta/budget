export { uid } from './uid';
import { normalizeToMonthly } from './cashflow';
import { getWeightedMonthlyBurn } from './spendingInsights';


/**
 * Calculate the safety buffer's target amount — now adaptive.
 *
 * Target = needs × safetyMonths, where `needs` follows the user's actual
 * behaviour instead of a static figure:
 *   needs = max( recency-weighted average of realised monthly spend,
 *                declared survival essentials (budget + active recurring) )
 *
 * The weighted average (see getWeightedMonthlyBurn) leans on recent months so
 * the buffer "follows" the user. Recurring cuts are already logged in the
 * ledger, so realised spend is directly comparable to declared essentials — no
 * double-counting. The declared essentials act as a floor: the buffer adapts
 * upward toward real spending but never drops below the stated survival need.
 *
 * Falls back to declared essentials when there is no completed-month history.
 */
export function calculateBufferTarget(state) {
  const declared = monthlyEssentials(state);
  const learned = getWeightedMonthlyBurn(state.monthly?.expenses || []);
  const needs = learned != null ? Math.max(learned, declared) : declared;
  return needs * (state.safetyMonths || 3);
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
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [tYear, tMonth] = goal.targetDate.split('-');
  const targetDateObj = new Date(parseInt(tYear, 10), parseInt(tMonth, 10) - 1, 1);

  const monthsDiff = (targetDateObj.getFullYear() - currentMonth.getFullYear()) * 12 + (targetDateObj.getMonth() - currentMonth.getMonth());

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
