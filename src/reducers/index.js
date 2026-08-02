import DOMPurify from 'dompurify';
import { uid, calculateBufferTarget } from '../utils/storeUtils';
import { applyDueExpenses } from '../utils/cashflow';
import { computeAllocation } from '../utils/allocator';

export function rootReducer(state, action) {
  let next;
  const thisMonth = new Date().toISOString().slice(0, 7);

  const base = state;

  switch (action.type) {
    case 'SET_CASH':
      next = { ...base, cash: Math.max(0, action.value) };
      break;

    case 'ADD_GOAL': {
      const name = action.goal.name ? DOMPurify.sanitize(action.goal.name) : 'Unnamed';
      next = {
        ...base,
        goals: [...base.goals, {
          id: uid(), saved: 0, isBuffer: false,
          type: 'saving',
          ...action.goal,
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
      if (!goal) return base;
      const remaining = Math.max(0, goal.target - goal.saved);
      const amt = Math.min(action.amount, base.cash, remaining);
      next = {
        ...base,
        cash: base.cash - amt,
        goals: base.goals.map(g => g.id === action.id ? { ...g, saved: g.saved + amt } : g),
      };
      break;
    }

    case 'WITHDRAW_GOAL': {
      const goal = base.goals.find(g => g.id === action.id);
      if (!goal) return base;
      const amt = Math.min(action.amount, goal.saved);
      next = {
        ...base,
        cash: base.cash + amt,
        goals: base.goals.map(g => g.id === action.id ? { ...g, saved: g.saved - amt } : g),
      };
      break;
    }

    case 'MOVE_FUNDS': {
      const from = base.goals.find(g => g.id === action.fromId);
      const to = base.goals.find(g => g.id === action.toId);
      if (!from || !to) return base;
      const amt = to.isBuffer
        ? Math.min(action.amount, from.saved)
        : Math.min(action.amount, from.saved, to.target - to.saved);
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

    case 'PURCHASE_ITEM':
      next = { ...base, goals: base.goals.filter(g => g.id !== action.id) };
      break;

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
        for (const [goalId, amt] of Object.entries(inc.allocations)) {
          const goal = nextGoals.find(g => g.id === goalId);
          if (goal) goal.saved = Math.max(0, goal.saved - amt);
        }
        const allocatedToGoals = Object.values(inc.allocations).reduce((s, v) => s + v, 0);
        const cashPortion = inc.cashAllocated ?? Math.max(0, inc.amount - allocatedToGoals);
        nextCash = Math.max(0, nextCash - cashPortion);
      } else {
        nextCash = Math.max(0, nextCash - inc.amount);
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

    case 'SET_BUFFER_MAX':
      // Kept for backwards-compat with any stored dispatches
      next = { ...base, bufferMaxMonths: action.value };
      break;

    case 'SET_MONTHLY_BUDGET':
      next = { ...base, monthly: { ...(base.monthly || {}), budget: action.value } };
      break;

    case 'SET_SAFETY_MONTHS':
      next = { ...base, safetyMonths: Math.max(1, action.value) };
      break;

    case 'ADD_EXPENSE': {
      const name = action.name ? DOMPurify.sanitize(action.name) : 'Unknown Expense';
      const date = action.date || new Date().toISOString();
      const exp = { id: uid(), name, amount: action.amount, date };
      const goals = base.goals.map(g => g.isBuffer ? { ...g, saved: Math.max(0, g.saved - action.amount) } : g);
      const inCurrentMonth = typeof date === 'string' && date.slice(0, 7) === thisMonth;
      next = {
        ...base,
        goals,
        monthly: { 
          ...base.monthly, 
          spent: inCurrentMonth ? base.monthly.spent + action.amount : base.monthly.spent, 
          expenses: [...base.monthly.expenses, exp] 
        },
      };
      break;
    }

    case 'DELETE_EXPENSE': {
      const exp = base.monthly.expenses.find(e => e.id === action.id);
      if (!exp) return base;
      const goals = base.goals.map(g => g.isBuffer ? { ...g, saved: g.saved + exp.amount } : g);
      // The spent counter only tracks the current month — deleting a historical
      // ledger entry must not distort it.
      const inCurrentMonth = typeof exp.date === 'string' && exp.date.slice(0, 7) === thisMonth;
      next = {
        ...base,
        goals,
        monthly: {
          ...base.monthly,
          spent: inCurrentMonth ? base.monthly.spent - exp.amount : base.monthly.spent,
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
        (sum, e) => (typeof e?.date === 'string' && e.date.slice(0, 7) === thisMonth
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
