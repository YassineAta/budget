import DOMPurify from 'dompurify';
import { uid, calculateBufferTarget } from '../utils/storeUtils';
import { applyDueExpenses } from '../utils/cashflow';
import { computeAllocation } from '../utils/allocator';

/** Round to 2 decimals (currency minor units). */
const r2 = n => Math.round(n * 100) / 100;
/** Coerce to a finite, non-negative number (NaN/±Infinity/negatives → 0).
 *  The authoritative validation guard at the reducer edge: no non-finite or
 *  negative money value is ever allowed into state (invariant #6). */
const nn = v => (Number.isFinite(v) ? Math.max(0, v) : 0);

export function rootReducer(state, action) {
  let next;
  const thisMonth = new Date().toISOString().slice(0, 7);

  const base = state;

  switch (action.type) {
    case 'SET_CASH':
      next = { ...base, cash: nn(action.value) };
      break;

    case 'ADD_GOAL': {
      const name = action.goal.name ? DOMPurify.sanitize(action.goal.name) : 'Unnamed';
      next = {
        ...base,
        goals: [...base.goals, {
          id: uid(), isBuffer: false,
          type: 'saving',
          ...action.goal,
          // Money fields are validated at the edge — never trust raw form input.
          target: nn(action.goal.target),
          saved: nn(action.goal.saved),
          name,
          // Legacy fields: harmless but no longer used by engine
          isRecurring: false, monthlyCost: 0, activeThisMonth: true,
        }]
      };
      break;
    }

    case 'EDIT_GOAL': {
      const updates = { ...action.updates };
      if (updates.name) updates.name = DOMPurify.sanitize(updates.name);
      // Reject a non-finite target (e.g. parseFloat('') → NaN) rather than let it
      // poison state and fail schema validation on the next reload (invariant #6).
      if ('target' in updates) {
        if (Number.isFinite(updates.target)) updates.target = Math.max(0, updates.target);
        else delete updates.target;
      }
      if ('saved' in updates) {
        if (Number.isFinite(updates.saved)) updates.saved = Math.max(0, updates.saved);
        else delete updates.saved;
      }
      next = {
        ...base,
        goals: base.goals.map(g => g.id === action.id ? { ...g, ...updates } : g)
      };
      break;
    }

    case 'DELETE_GOAL':
      next = {
        ...base,
        cash: base.cash + (base.goals.find(g => g.id === action.id)?.saved || 0),
        goals: base.goals.filter(g => g.id !== action.id),
      };
      break;

    case 'FUND_GOAL': {
      const goal = base.goals.find(g => g.id === action.id);
      // Wishlist goals are tracking-only ("no balance effect") — never reserve
      // real money into them (invariant: wishlist holds no cash).
      if (!goal || goal.type === 'wishlist') return base;
      const remaining = Math.max(0, goal.target - goal.saved);
      const amt = r2(Math.min(nn(action.amount), base.cash, remaining));
      if (amt <= 0) return base;
      next = {
        ...base,
        cash: r2(base.cash - amt),
        goals: base.goals.map(g => g.id === action.id ? { ...g, saved: r2(g.saved + amt) } : g),
      };
      break;
    }

    case 'WITHDRAW_GOAL': {
      const goal = base.goals.find(g => g.id === action.id);
      if (!goal) return base;
      const amt = r2(Math.min(nn(action.amount), goal.saved));
      if (amt <= 0) return base;
      next = {
        ...base,
        cash: r2(base.cash + amt),
        goals: base.goals.map(g => g.id === action.id ? { ...g, saved: r2(g.saved - amt) } : g),
      };
      break;
    }

    case 'MOVE_FUNDS': {
      const from = base.goals.find(g => g.id === action.fromId);
      const to = base.goals.find(g => g.id === action.toId);
      // Cannot move money INTO a wishlist (tracking-only, holds no cash).
      if (!from || !to || to.type === 'wishlist') return base;
      const amt = r2(to.isBuffer
        ? Math.min(nn(action.amount), from.saved)
        : Math.min(nn(action.amount), from.saved, to.target - to.saved));
      if (amt <= 0) return base;
      next = {
        ...base,
        goals: base.goals.map(g => {
          if (g.id === action.fromId) return { ...g, saved: g.saved - amt };
          if (g.id === action.toId) return { ...g, saved: g.saved + amt };
          return g;
        }),
      };
      break;
    }

    case 'PURCHASE_ITEM': {
      const goal = base.goals.find(g => g.id === action.id);
      if (!goal) return base;
      // Double-entry: the goal's saved money leaves the system as a real expense.
      // Log it so the ledger records where the money went (invariant #1). The
      // paid split is 0/0 because the money came from the goal itself (removed by
      // dropping the goal), so deleting this record must refund nothing.
      const spentAmt = r2(nn(goal.saved));
      const date = new Date().toISOString();
      const entry = spentAmt > 0
        ? [{ id: uid(), name: `Purchased: ${goal.name}`, amount: spentAmt, date, paidFromCash: 0, paidFromBuffer: 0, isPurchase: true }]
        : [];
      // NOTE: this money was allocated to the goal over time, not spent from this
      // month's budget — so it is logged in the ledger for the audit trail but is
      // deliberately EXCLUDED from monthly.spent. The invariant is therefore
      // `spent === sum(current-month expenses WHERE NOT isPurchase)`, enforced at
      // every sum site (DELETE_EXPENSE, RESET_MONTHLY, store rollover recompute).
      next = {
        ...base,
        goals: base.goals.filter(g => g.id !== action.id),
        monthly: {
          ...base.monthly,
          expenses: [...base.monthly.expenses, ...entry],
        },
      };
      break;
    }

    case 'ADD_INCOME': {
      const source = action.source ? DOMPurify.sanitize(action.source) : 'Unknown Source';
      const inc = { id: uid(), source, amount: action.amount, date: new Date().toISOString() };
      next = {
        ...base,
        cash: base.cash + action.amount,
        incomeEvents: [inc, ...(base.incomeEvents || [])],
      };
      break;
    }

    case 'DELETE_INCOME': {
      const inc = base.incomeEvents?.find(e => e.id === action.id);
      if (!inc) return base;

      let nextCash = base.cash;
      let nextGoals = base.goals.map(g => ({ ...g }));

      if (inc.allocations) {
        // Historical-record semantics: an income event is a receipt, not a live
        // reversible ledger. Only claw back an allocation when the money is
        // demonstrably still present (goal exists AND still holds ≥ the allocated
        // amount). If it was since spent / moved / withdrawn, leave balances
        // untouched — never destroy money that isn't there, never go negative,
        // never orphan against a deleted goal (root cause of critical bug #2).
        for (const [goalId, amt] of Object.entries(inc.allocations)) {
          const goal = nextGoals.find(g => g.id === goalId);
          if (goal && goal.saved >= amt) goal.saved = r2(goal.saved - amt);
        }
        const cashPortion = inc.cashAllocated ?? 0;
        if (nextCash >= cashPortion) nextCash = r2(nextCash - cashPortion);
      } else {
        // Legacy quick-add (cash only): reverse only up to what remains.
        nextCash = r2(Math.max(0, nextCash - inc.amount));
      }

      next = {
        ...base,
        cash: nextCash,
        goals: nextGoals,
        incomeEvents: base.incomeEvents.filter(e => e.id !== action.id),
      };
      break;
    }

    case 'ALLOCATE_INCOME': {
      const { allocations, cashRemainder } = computeAllocation(base, action.amount);

      const goals = base.goals.map(g =>
        allocations[g.id] ? { ...g, saved: g.saved + allocations[g.id] } : g
      );

      const source = action.source ? DOMPurify.sanitize(action.source) : 'Unknown Source';
      const inc = {
        id: uid(), source, amount: action.amount,
        date: new Date().toISOString(),
        allocations, cashAllocated: cashRemainder,
      };
      next = {
        ...base,
        cash: base.cash + cashRemainder,
        goals,
        incomeEvents: [inc, ...(base.incomeEvents || [])],
      };
      break;
    }

    case 'SET_AI_PROFILE':
      next = { ...base, aiProfile: { ...(base.aiProfile || {}), ...action.updates } };
      break;

    case 'SET_BUFFER_MAX':
      // Kept for backwards-compat with any stored dispatches
      next = { ...base, bufferMaxMonths: action.value };
      break;

    case 'SET_MONTHLY_BUDGET':
      next = { ...base, monthly: { ...(base.monthly || {}), budget: nn(action.value) } };
      break;

    case 'SET_SAFETY_MONTHS':
      next = { ...base, safetyMonths: Math.max(1, Number.isFinite(action.value) ? action.value : 1) };
      break;

    case 'ADD_EXPENSE': {
      const amount = r2(nn(action.amount));
      if (amount <= 0) return base;
      const name = action.name ? DOMPurify.sanitize(action.name) : 'Unknown Expense';
      const date = action.date || new Date().toISOString();

      // Cash-first, then buffer. Free cash is consumed before dipping into the
      // safety buffer (chosen expense model). Record the ACTUAL split on the
      // ledger entry so DELETE_EXPENSE refunds exactly what was removed —
      // closing the mint-on-delete hole (critical bugs #1 & #3).
      const paidFromCash = r2(Math.min(base.cash, amount));
      const buf = base.goals.find(g => g.isBuffer);
      const paidFromBuffer = buf ? r2(Math.min(Math.max(0, buf.saved), amount - paidFromCash)) : 0;

      const exp = { id: uid(), name, amount, date, paidFromCash, paidFromBuffer };
      const goals = base.goals.map(g => g.isBuffer ? { ...g, saved: r2(Math.max(0, g.saved - paidFromBuffer)) } : g);
      const inCurrentMonth = typeof date === 'string' && date.slice(0, 7) === thisMonth;
      next = {
        ...base,
        cash: r2(Math.max(0, base.cash - paidFromCash)),
        goals,
        monthly: {
          ...base.monthly,
          spent: inCurrentMonth ? r2(base.monthly.spent + amount) : base.monthly.spent,
          expenses: [...base.monthly.expenses, exp],
        },
      };
      break;
    }

    case 'DELETE_EXPENSE': {
      const exp = base.monthly.expenses.find(e => e.id === action.id);
      if (!exp) return base;
      // Refund EXACTLY what was deducted, using the recorded split. Legacy entries
      // (created before the split was tracked) are treated as fully buffer-funded,
      // preserving their original semantics.
      const hasSplit = exp.paidFromCash !== undefined || exp.paidFromBuffer !== undefined;
      const refundCash = hasSplit ? nn(exp.paidFromCash) : 0;
      const refundBuffer = hasSplit ? nn(exp.paidFromBuffer) : nn(exp.amount);
      const goals = base.goals.map(g => g.isBuffer ? { ...g, saved: r2(g.saved + refundBuffer) } : g);
      // The spent counter only tracks the current month — deleting a historical
      // ledger entry must not distort it.
      // Purchase entries were never added to monthly.spent (goal money, not
      // budget spend), so deleting one must not decrement it either.
      const affectsSpent = !exp.isPurchase && typeof exp.date === 'string' && exp.date.slice(0, 7) === thisMonth;
      next = {
        ...base,
        cash: r2(base.cash + refundCash),
        goals,
        monthly: {
          ...base.monthly,
          spent: affectsSpent ? r2(base.monthly.spent - nn(exp.amount)) : base.monthly.spent,
          expenses: base.monthly.expenses.filter(e => e.id !== action.id),
        },
      };
      break;
    }

    case 'RESET_MONTHLY': {
      // Non-destructive: the expense ledger is append-only history and is never
      // erased. Resetting only re-anchors the billing period to the current month
      // and recomputes the live spent counter from this month's ledger entries.
      const ledger = Array.isArray(base.monthly?.expenses) ? base.monthly.expenses : [];
      const spent = ledger.reduce(
        (sum, e) => (!e?.isPurchase && typeof e?.date === 'string' && e.date.slice(0, 7) === thisMonth
          ? sum + (Number(e.amount) || 0)
          : sum),
        0,
      );
      next = {
        ...base,
        monthly: { ...base.monthly, spent: Math.round(spent * 100) / 100, resetDate: thisMonth },
      };
      break;
    }

    // ── Recurring expense management ────────────────────────────────────────

    case 'ADD_RECURRING_EXPENSE': {
      const name = action.expense.name ? DOMPurify.sanitize(action.expense.name) : 'Unnamed';
      const nowDate = new Date();
      const now = nowDate.toISOString();
      const period = action.expense.period || 'monthly';
      const cutDay = action.expense.cut_day || 1;

      // Compute the last_applied_date as the most recent past cut date strictly
      // before now. This lets the engine correctly detect whether the current
      // period's cut is already due (e.g. expense added on the 11th with cut_day=10
      // → April 10 is in the past and must fire immediately).
      let lastApplied;
      if (period === 'monthly') {
        // Try the cut date in the current month
        let year = nowDate.getFullYear();
        let month = nowDate.getMonth();
        const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
        let day = Math.min(cutDay, daysInMonth(year, month));
        let candidate = new Date(year, month, day); // midnight local

        // Whether the cut day is today, in the future, or already past this month,
        // we always anchor to the previous month's cut date. This ensures the engine
        // fires this month's cut (if already due) on the very next applyDueExpenses call.
        month -= 1;
        if (month < 0) { month = 11; year -= 1; }
        day = Math.min(cutDay, daysInMonth(year, month));
        lastApplied = new Date(year, month, day).toISOString();
      } else {
        // Weekly: set last_applied_date to 7 days ago so the next cut is in 7 days
        lastApplied = new Date(nowDate.getTime() - 7 * 86_400_000).toISOString();
      }

      const exp = {
        id: uid(),
        name,
        amount: action.expense.amount,
        period,
        cut_day: cutDay,
        start_date: now,
        last_applied_date: action.expense.last_applied_date || lastApplied,
        active: true,
      };
      // Immediately apply any cuts that are already due (e.g. cut_day was yesterday)
      const stateWithExp = { ...base, recurringExpenses: [...(base.recurringExpenses || []), exp] };
      next = applyDueExpenses(stateWithExp);
      break;
    }

    case 'EDIT_RECURRING_EXPENSE': {
      next = {
        ...base,
        recurringExpenses: (base.recurringExpenses || []).map(e =>
          e.id === action.id ? { ...e, ...action.updates } : e
        )
      };
      break;
    }

    case 'DELETE_RECURRING_EXPENSE':
      next = {
        ...base,
        recurringExpenses: (base.recurringExpenses || []).filter(e => e.id !== action.id)
      };
      break;

    case 'TOGGLE_RECURRING':
      next = {
        ...base,
        recurringExpenses: (base.recurringExpenses || []).map(e =>
          e.id === action.id ? { ...e, active: !e.active } : e
        )
      };
      break;

    // ── Cashflow tick (on app focus / visibility change) ────────────────────

    case 'APPLY_CASHFLOW':
      next = applyDueExpenses(base);
      break;

    default:
      return base;
  }

  if (next) {
    // Always keep buffer target in sync with safetyMonths and recurringExpenses
    const bufTarget = calculateBufferTarget(next);
    next.goals = next.goals.map(g => g.isBuffer ? { ...g, target: bufTarget } : g);
    // Purge legacy flag so it never reappears
    delete next.bufferLeveledUp;
  }
  return next || base;
}
