let _idCounter = Date.now();
export function uid() { return (++_idCounter).toString(36); }

export function calculateBufferTarget(state) {
  const needs = state.monthly?.budget || 200;
  const recurring = (state.goals || [])
    .filter(g => g.isRecurring)
    .reduce((s, g) => s + (g.monthlyCost || 0), 0);
  return (needs + recurring) * (state.safetyMonths || 3);
}

export function monthlyEssentials(state) {
  const needs = state.monthly?.budget || 200;
  const recurring = (state.goals || [])
    .filter(g => g.isRecurring)
    .reduce((s, g) => s + (g.monthlyCost || 0), 0);
  return needs + recurring;
}

export function getMonthlySaving(goal) {
  if (!goal.targetDate || goal.saved >= goal.target) return null;
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const targetDateObj = new Date(goal.targetDate + '-01');

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
