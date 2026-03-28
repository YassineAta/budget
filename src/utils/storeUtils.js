import { normalizeToMonthly } from './cashflow';

let _idCounter = Date.now();
export function uid() { return (++_idCounter).toString(36); }

/**
 * Calculate the safety buffer's target amount.
 * Target = (monthly survival budget + all active recurring costs, normalised to
 * monthly) × safetyMonths.
 *
 * Reads from state.recurringExpenses (new model). Falls back gracefully to 0
 * when the array is absent (fresh state before migration).
 */
export function calculateBufferTarget(state) {
  const needs = state.monthly?.budget || 200;
  const recurring = (state.recurringExpenses || [])
    .filter(e => e.active)
    .reduce((s, e) => s + normalizeToMonthly(e), 0);
  return (needs + recurring) * (state.safetyMonths || 3);
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
