/**
 * Unified allocation engine — used by both the preview UI and the
 * ALLOCATE_INCOME reducer so that what the user sees always matches
 * what actually happens.
 *
 * Algorithm (in priority order):
 *  1. Buffer full fill  — fill buffer to full safety target (always top priority)
 *  2. Urgent goals     — overdue or due this month, fill fully (urgency order)
 *  3. Deadline goals   — future deadlines, installment only (nearest first)
 *  4. High priority    — non-deadline saving goals, fill fully
 *  5. Medium priority  — non-deadline saving goals, fill fully
 *  6. Wishlist         — only when buffer is at full target, sorted by priority
 *  7. Low priority     — non-deadline saving goals, fill fully
 *  8. Cash remainder   — anything left stays as free cash
 */

import { monthlyEssentials } from './storeUtils';
import { getMonthlySaving } from './storeUtils';

const P_ORDER = { High: 0, Medium: 1, Low: 2 };

/**
 * Compute how `income` should be split across buffer and goals.
 *
 * @param {object} state  — full app state
 * @param {number} income — positive number
 * @returns {{
 *   allocations: Record<string, number>,  // goalId → amount allocated
 *   lines: Array<{ label: string, goalId: string, amount: number, icon: string, type: string }>,
 *   cashRemainder: number
 * }}
 */
export function computeAllocation(state, income) {
  // Running saved totals — mutated locally, never touches real state
  const saved = {};
  (state.goals || []).forEach(g => { saved[g.id] = g.saved; });

  const allocations = {};
  const lines = [];
  let pool = income;
  const essentials = monthlyEssentials(state);

  function give(goalId, amount, label, icon, type) {
    if (amount <= 0) return;
    saved[goalId] += amount;
    allocations[goalId] = (allocations[goalId] || 0) + amount;
    pool -= amount;
    lines.push({ label, goalId, amount, icon, type });
  }

  const buf = (state.goals || []).find(g => g.isBuffer);

  // ── Phase 1: Buffer — fill to full safety target (always top priority) ────
  if (buf && pool > 0) {
    const survivalNeeded = Math.max(0, essentials - saved[buf.id]);
    const survivalTake = Math.min(survivalNeeded, pool);
    if (survivalTake > 0) give(buf.id, survivalTake, 'Safety Buffer (survival)', '🛡️', 'survival');

    // Immediately top up the rest of the buffer target before anything else
    if (pool > 0) {
      const topupNeeded = Math.max(0, buf.target - saved[buf.id]);
      const topupTake = Math.min(topupNeeded, pool);
      if (topupTake > 0) give(buf.id, topupTake, 'Safety Buffer (top-up)', '🛡️', 'buffer-topup');
    }
  }

  // ── Build categorised goal lists ────────────────────────────────────────────
  const savingGoals = (state.goals || []).filter(g =>
    !g.isBuffer && g.type !== 'wishlist'
  );
  const deadlineGoals = savingGoals.filter(g => g.targetDate);
  const noDeadlineGoals = savingGoals.filter(g => !g.targetDate);

  // Annotate deadline goals with their current plan (using running saved totals)
  const annotated = deadlineGoals
    .map(g => {
      const plan = getMonthlySaving({ ...g, saved: saved[g.id] });
      return { g, plan };
    })
    .filter(({ plan, g }) => plan !== null && saved[g.id] < g.target);

  // Sort by urgency: overdue (-2) < due-now (-1) < months ascending, then by priority
  annotated.sort((a, b) => {
    const ua = a.plan.status === 'overdue' ? -2 : a.plan.status === 'due-now' ? -1 : a.plan.months;
    const ub = b.plan.status === 'overdue' ? -2 : b.plan.status === 'due-now' ? -1 : b.plan.months;
    if (ua !== ub) return ua - ub;
    return (P_ORDER[a.g.priority] ?? 1) - (P_ORDER[b.g.priority] ?? 1);
  });

  // ── Phase 2: Urgent deadline goals (overdue / due this month) ───────────────
  for (const { g, plan } of annotated) {
    if (pool <= 0) break;
    if (plan.status !== 'overdue' && plan.status !== 'due-now') continue;
    const fill = Math.min(g.target - saved[g.id], pool);
    if (fill > 0) {
      const label = plan.status === 'overdue' ? `${g.name} (overdue)` : `${g.name} (due this month)`;
      give(g.id, fill, label, '🚨', 'urgent');
    }
  }

  // ── Phase 3: Future deadline goals — installment only ───────────────────────
  for (const { g, plan } of annotated) {
    if (pool <= 0) break;
    if (plan.status === 'overdue' || plan.status === 'due-now') continue;
    const remaining = g.target - saved[g.id];
    if (remaining <= 0) continue;
    const take = Math.min(plan.needed, pool, remaining);
    if (take > 0) give(g.id, take, `${g.name} (installment)`, '📆', 'deadline');
  }

  // ── Phase 4: High priority non-deadline saving goals ────────────────────────
  noDeadlineGoals
    .filter(g => g.priority === 'High' && saved[g.id] < g.target)
    .forEach(g => {
      if (pool <= 0) return;
      const fill = Math.min(g.target - saved[g.id], pool);
      if (fill > 0) give(g.id, fill, g.name, '🔥', 'high-priority');
    });

  // ── Phase 5: Medium priority non-deadline saving goals ──────────────────────
  noDeadlineGoals
    .filter(g => (g.priority === 'Medium' || !g.priority) && saved[g.id] < g.target)
    .forEach(g => {
      if (pool <= 0) return;
      const fill = Math.min(g.target - saved[g.id], pool);
      if (fill > 0) give(g.id, fill, g.name, '🎯', 'medium-priority');
    });

  // ── Phase 7: Wishlist — only when buffer is fully funded ────────────────────
  const bufferFull = buf && saved[buf.id] >= buf.target;
  if (bufferFull && pool > 0) {
    (state.goals || [])
      .filter(g => g.type === 'wishlist' && saved[g.id] < g.target)
      .sort((a, b) => (P_ORDER[a.priority] ?? 1) - (P_ORDER[b.priority] ?? 1))
      .forEach(g => {
        if (pool <= 0) return;
        const fill = Math.min(g.target - saved[g.id], pool);
        if (fill > 0) give(g.id, fill, g.name, '💭', 'wishlist');
      });
  }

  // ── Phase 8: Low priority non-deadline saving goals ─────────────────────────
  noDeadlineGoals
    .filter(g => g.priority === 'Low' && saved[g.id] < g.target)
    .forEach(g => {
      if (pool <= 0) return;
      const fill = Math.min(g.target - saved[g.id], pool);
      if (fill > 0) give(g.id, fill, g.name, '🎯', 'low-priority');
    });

  return { allocations, lines, cashRemainder: pool };
}
