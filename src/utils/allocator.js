/**
 * Unified allocation engine — used by both the preview UI and the
 * ALLOCATE_INCOME reducer so that what the user sees always matches
 * what actually happens.
 *
 * Model: a "bucketed split" (waterfall + fixed-ratio hybrid, in the spirit of
 * an emergency-fund-first + 50/30/20 plan). Every paycheck is divided
 * concurrently between the Safety Buffer, the Priority reserve (e.g. Projet
 * d'étude) and the rest of the goals — so you build security and fund the big
 * goal and still keep money to live, all at once.
 *
 * Order of operations:
 *  0. Survival floor — never leave the buffer below one month of essentials.
 *  1. Ratio split    — divide the remaining income into three buckets by the
 *                      active plan (depends on whether the buffer is full).
 *  2. Buffer bucket  — fill the buffer toward its full target.
 *  3. Priority bucket— fill priority-reserve goals (fully, by priority order).
 *  4. Goals bucket   — distribute to the remaining goals via the classic
 *                      waterfall (urgent → deadline → high → medium → wishlist → low).
 *  5. Cascade        — any bucket whose destination is already full spills its
 *                      leftover into the others (buffer → priority → goals);
 *                      only when everything is full does money stay as cash.
 */

import { monthlyEssentials, getMonthlySaving } from './storeUtils';

const P_ORDER = { High: 0, Medium: 1, Low: 2 };

/**
 * Split ratios applied to each allocated income. Editable in one place.
 *  - `filling`    is used while the Safety Buffer is still below its full target.
 *  - `bufferFull` is used once the buffer is fully funded: its former share is
 *                 redivided evenly between the priority reserve and the goals.
 * Each set must sum to 1.
 */
export const ALLOCATION_PLAN = {
  filling:    { buffer: 0.50, priority: 0.20, goals: 0.30 },
  bufferFull: { buffer: 0.00, priority: 0.50, goals: 0.50 },
};

/**
 * Compute how `income` should be split across the buffer and goals.
 *
 * @param {object} state  — full app state
 * @param {number} income — positive number
 * @param {object} [plan] — ratio plan override (defaults to ALLOCATION_PLAN)
 * @returns {{
 *   allocations: Record<string, number>,  // goalId → amount allocated
 *   lines: Array<{ label: string, goalId: string, amount: number, icon: string, type: string }>,
 *   cashRemainder: number
 * }}
 */
export function computeAllocation(state, income, plan = ALLOCATION_PLAN) {
  // Running saved totals — mutated locally, never touches real state.
  const saved = {};
  (state.goals || []).forEach(g => { saved[g.id] = g.saved; });

  const allocations = {};
  const lines = [];
  const essentials = monthlyEssentials(state);
  const buf = (state.goals || []).find(g => g.isBuffer);

  /**
   * Move up to `amount` from a wallet into a goal. Merges consecutive
   * contributions to the same destination+label into one preview line so the
   * split stays readable. Returns the amount actually given.
   */
  function give(wallet, goalId, amount, label, icon, type) {
    const amt = Math.min(amount, wallet.amount);
    if (amt <= 0) return 0;
    saved[goalId] += amt;
    allocations[goalId] = (allocations[goalId] || 0) + amt;
    wallet.amount -= amt;
    const existing = lines.find(l => l.goalId === goalId && l.label === label);
    if (existing) existing.amount += amt;
    else lines.push({ label, goalId, amount: amt, icon, type });
    return amt;
  }

  const main = { amount: income };

  // ── Phase 0: Survival floor ──────────────────────────────────────────────
  // Keep at least one month of essentials in the buffer before splitting the
  // rest. A genuine emergency guard — normally already satisfied.
  if (buf && main.amount > 0) {
    const floor = Math.min(essentials, buf.target);
    const need = Math.max(0, floor - saved[buf.id]);
    if (need > 0) give(main, buf.id, need, 'Safety Buffer (survival)', '🛡️', 'survival');
  }

  // ── Phase 1: Ratio split ─────────────────────────────────────────────────
  const bufferFull = buf ? saved[buf.id] >= buf.target : true;
  const r = bufferFull ? plan.bufferFull : plan.filling;
  const base = main.amount;
  const bufWallet = { amount: base * r.buffer };
  const priWallet = { amount: base * r.priority };
  const goalWallet = { amount: base * r.goals };
  main.amount = 0;

  // ── Phase 2: Buffer bucket ───────────────────────────────────────────────
  if (buf) {
    const need = Math.max(0, buf.target - saved[buf.id]);
    if (need > 0) give(bufWallet, buf.id, need, 'Safety Buffer', '🛡️', 'buffer');
  }

  // ── Phase 3: Priority reserve bucket ─────────────────────────────────────
  const priorityGoals = (state.goals || [])
    .filter(g => g.isPriority && !g.isBuffer && g.type !== 'wishlist' && saved[g.id] < g.target)
    .sort((a, b) => (P_ORDER[a.priority] ?? 1) - (P_ORDER[b.priority] ?? 1));
  for (const g of priorityGoals) {
    if (priWallet.amount <= 0) break;
    give(priWallet, g.id, g.target - saved[g.id], `${g.name} (priority)`, '⭐', 'priority');
  }

  // ── Phase 4: Goals bucket (classic waterfall) ────────────────────────────
  distributeGoals({ state, saved, bufferFull, give }, goalWallet);

  // ── Phase 5: Cascade unused bucket money — buffer → priority → goals ──────
  const leftover = { amount: bufWallet.amount + priWallet.amount + goalWallet.amount };
  if (buf && leftover.amount > 0) {
    const need = Math.max(0, buf.target - saved[buf.id]);
    if (need > 0) give(leftover, buf.id, need, 'Safety Buffer', '🛡️', 'buffer');
  }
  for (const g of priorityGoals) {
    if (leftover.amount <= 0) break;
    const need = g.target - saved[g.id];
    if (need > 0) give(leftover, g.id, need, `${g.name} (priority)`, '⭐', 'priority');
  }
  distributeGoals({ state, saved, bufferFull, give }, leftover);

  return { allocations, lines, cashRemainder: Math.max(0, leftover.amount) };
}

/**
 * Distribute a wallet across the non-buffer, non-priority saving goals using
 * the classic priority waterfall. Mutates `saved`/lines via `give`.
 */
function distributeGoals({ state, saved, bufferFull, give }, wallet) {
  if (wallet.amount <= 0) return;

  const savingGoals = (state.goals || []).filter(g =>
    !g.isBuffer && !g.isPriority && g.type !== 'wishlist'
  );
  const deadlineGoals = savingGoals.filter(g => g.targetDate);
  const noDeadlineGoals = savingGoals.filter(g => !g.targetDate);

  // Annotate deadline goals with their current plan (using running saved totals).
  const annotated = deadlineGoals
    .map(g => ({ g, plan: getMonthlySaving({ ...g, saved: saved[g.id] }) }))
    .filter(({ plan, g }) => plan !== null && saved[g.id] < g.target);

  // Sort by urgency: overdue (-2) < due-now (-1) < months ascending, then priority.
  annotated.sort((a, b) => {
    const ua = a.plan.status === 'overdue' ? -2 : a.plan.status === 'due-now' ? -1 : a.plan.months;
    const ub = b.plan.status === 'overdue' ? -2 : b.plan.status === 'due-now' ? -1 : b.plan.months;
    if (ua !== ub) return ua - ub;
    return (P_ORDER[a.g.priority] ?? 1) - (P_ORDER[b.g.priority] ?? 1);
  });

  // Urgent deadline goals (overdue / due this month) — fill fully.
  for (const { g, plan } of annotated) {
    if (wallet.amount <= 0) break;
    if (plan.status !== 'overdue' && plan.status !== 'due-now') continue;
    const label = plan.status === 'overdue' ? `${g.name} (overdue)` : `${g.name} (due this month)`;
    give(wallet, g.id, g.target - saved[g.id], label, '🚨', 'urgent');
  }

  // Future deadline goals — installment only.
  for (const { g, plan } of annotated) {
    if (wallet.amount <= 0) break;
    if (plan.status === 'overdue' || plan.status === 'due-now') continue;
    const remaining = g.target - saved[g.id];
    if (remaining <= 0) continue;
    give(wallet, g.id, Math.min(plan.needed, remaining), `${g.name} (installment)`, '📆', 'deadline');
  }

  // High priority non-deadline goals.
  noDeadlineGoals
    .filter(g => g.priority === 'High' && saved[g.id] < g.target)
    .forEach(g => give(wallet, g.id, g.target - saved[g.id], g.name, '🔥', 'high-priority'));

  // Medium priority (default) non-deadline goals.
  noDeadlineGoals
    .filter(g => (g.priority === 'Medium' || !g.priority) && saved[g.id] < g.target)
    .forEach(g => give(wallet, g.id, g.target - saved[g.id], g.name, '🎯', 'medium-priority'));

  // Wishlist — only when the buffer is fully funded.
  if (bufferFull) {
    (state.goals || [])
      .filter(g => g.type === 'wishlist' && saved[g.id] < g.target)
      .sort((a, b) => (P_ORDER[a.priority] ?? 1) - (P_ORDER[b.priority] ?? 1))
      .forEach(g => give(wallet, g.id, g.target - saved[g.id], g.name, '💭', 'wishlist'));
  }

  // Low priority non-deadline goals.
  noDeadlineGoals
    .filter(g => g.priority === 'Low' && saved[g.id] < g.target)
    .forEach(g => give(wallet, g.id, g.target - saved[g.id], g.name, '🎯', 'low-priority'));
}
