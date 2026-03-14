import DOMPurify from 'dompurify';
import { uid, calculateBufferTarget, monthlyEssentials, getMonthlySaving } from '../utils/storeUtils';

export function rootReducer(state, action) {
  let next;
  const thisMonth = new Date().toISOString().slice(0, 7);

  const base = state; // top level placeholder 

  switch (action.type) {
    case 'SET_CASH':
      next = { ...base, cash: Math.max(0, action.value) };
      break;

    case 'ADD_GOAL': {
      const name = action.goal.name ? DOMPurify.sanitize(action.goal.name) : 'Unnamed';
      next = { ...base, goals: [...base.goals, { id: uid(), saved: 0, isBuffer: false, isRecurring: false, monthlyCost: 0, ...action.goal, name }] };
      break;
    }

    case 'EDIT_GOAL': {
      const updates = { ...action.updates };
      if (updates.name) updates.name = DOMPurify.sanitize(updates.name);
      
      next = {
        ...base,
        goals: base.goals.map(g => g.id === action.id ? {
          ...g,
          ...updates,
          monthlyCost: (updates.isRecurring || g.isRecurring)
            ? (updates.monthlyCost ?? g.monthlyCost ?? updates.target ?? g.target)
            : 0
        } : g)
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
      const amt = goal.isBuffer
        ? Math.min(action.amount, base.cash)
        : Math.min(action.amount, base.cash, goal.target - goal.saved);
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

    case 'ALLOCATE_INCOME': {
      let pool = action.amount;
      const goals = base.goals.map(g => ({ ...g }));
      const essentials = monthlyEssentials(base);

      const buf = goals.find(g => g.isBuffer);
      if (buf) {
        const neededForSurvival = Math.max(0, essentials - buf.saved);
        const toSurvival = Math.min(neededForSurvival, pool);
        buf.saved += toSurvival;
        pool -= toSurvival;
      }

      goals.filter(g => !g.isBuffer && g.saved < g.target).forEach(g => {
        const plan = getMonthlySaving(g);
        if (plan && plan.needed > 0) {
          const installment = Math.min(plan.needed, pool, g.target - g.saved);
          g.saved += installment;
          pool -= installment;
        }
      });

      const order = { High: 0, Medium: 1, Low: 2 };
      goals.filter(g => !g.isBuffer && g.saved < g.target)
        .sort((a, b) => order[a.priority] - order[b.priority])
        .forEach(g => {
          const fill = Math.min(g.target - g.saved, pool);
          g.saved += fill;
          pool -= fill;
        });

      if (buf && pool > 0) {
        const toBuffer = Math.min(buf.target - buf.saved, pool);
        buf.saved += toBuffer;
        pool -= toBuffer;
      }

      const source = action.source ? DOMPurify.sanitize(action.source) : 'Unknown Source';
      const inc = { id: uid(), source, amount: action.amount, date: new Date().toISOString() };
      next = {
        ...base,
        cash: base.cash + pool,
        goals,
        incomeEvents: [inc, ...(base.incomeEvents || [])],
      };
      break;
    }

    case 'DISMISS_BUFFER_LEVELUP': {
      const newMonths = Math.min((base.safetyMonths || 3) + 1, base.bufferMaxMonths || 12);
      next = { ...base, bufferLeveledUp: false, safetyMonths: newMonths };
      break;
    }

    case 'SET_BUFFER_MAX':
      next = {
        ...base,
        bufferMaxMonths: action.value,
        safetyMonths: Math.min(base.safetyMonths || 3, action.value)
      };
      break;

    case 'SET_MONTHLY_BUDGET':
      next = { ...base, monthly: { ...(base.monthly || {}), budget: action.value } };
      break;

    case 'SET_SAFETY_MONTHS':
      next = { ...base, safetyMonths: action.value, bufferLeveledUp: false };
      break;

    case 'ADD_EXPENSE': {
      const name = action.name ? DOMPurify.sanitize(action.name) : 'Unknown Expense';
      const exp = { id: uid(), name, amount: action.amount, date: new Date().toISOString() };
      const goals = base.goals.map(g => g.isBuffer ? { ...g, saved: Math.max(0, g.saved - action.amount) } : g);
      next = {
        ...base,
        goals,
        monthly: { ...base.monthly, spent: base.monthly.spent + action.amount, expenses: [...base.monthly.expenses, exp] },
      };
      break;
    }

    case 'DELETE_EXPENSE': {
      const exp = base.monthly.expenses.find(e => e.id === action.id);
      if (!exp) return base;
      const goals = base.goals.map(g => g.isBuffer ? { ...g, saved: g.saved + exp.amount } : g);
      next = {
        ...base,
        goals,
        monthly: { ...base.monthly, spent: base.monthly.spent - exp.amount, expenses: base.monthly.expenses.filter(e => e.id !== action.id) },
      };
      break;
    }

    case 'RESET_MONTHLY':
      next = {
        ...base,
        goals: base.goals.map(g => g.isRecurring ? { ...g, saved: 0 } : g),
        monthly: { ...base.monthly, spent: 0, expenses: [], resetDate: thisMonth },
      };
      break;

    default:
      return base;
  }

  if (next) {
    const bufTarget = calculateBufferTarget(next);
    next.goals = next.goals.map(g => g.isBuffer ? { ...g, target: bufTarget } : g);

    const bufAfter = next.goals.find(g => g.isBuffer);
    const maxMonths = next.bufferMaxMonths || 12;
    if (bufAfter && bufAfter.target > 0 && bufAfter.saved >= bufAfter.target && (next.safetyMonths || 3) < maxMonths && !next.bufferLeveledUp) {
      next.bufferLeveledUp = true;
    }
  }
  return next || base;
}
