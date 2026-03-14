import { createContext, useContext, useReducer, useEffect } from 'react';

const STORAGE_KEY = 'finplan_v6';

let _idCounter = Date.now();
export function uid() { return (++_idCounter).toString(36); }

// ─── Buffer target helper ─────────────────────────────────────────────────────
export function calculateBufferTarget(state) {
  const needs = state.monthly.budget || 200;
  const recurring = state.goals
    .filter(g => g.isRecurring)
    .reduce((s, g) => s + (g.monthlyCost || 0), 0);
  return (needs + recurring) * (state.safetyMonths || 3);
}

// ─── Monthly essentials total helper ─────────────────────────────────────────
export function monthlyEssentials(state) {
  const needs = state.monthly.budget || 200;
  const recurring = state.goals
    .filter(g => g.isRecurring)
    .reduce((s, g) => s + (g.monthlyCost || 0), 0);
  return needs + recurring;
}

// ─── Saving plan helper ───────────────────────────────────────────────────────
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

  // monthsDiff 1 means target is next month. We have this month and next month (2 installments).
  const installments = monthsDiff + 1;
  return { needed: Math.ceil((goal.target - goal.saved) / installments), months: installments, status: 'active' };
}

// ─── Default state ────────────────────────────────────────────────────────────
const defaultState = {
  cash: 0,                 // Free unallocated cash (Wallet)
  monthly: { budget: 200, spent: 0, expenses: [], resetDate: new Date().toISOString().slice(0, 7) },
  safetyMonths: 3,         // Current buffer coverage target (grows automatically)
  bufferMaxMonths: 12,     // Maximum months the buffer will grow to
  bufferLeveledUp: false,  // Flag set when buffer auto-grew
  goals: [
    { id: 'buffer', name: 'Safety Buffer', target: 0, saved: 0, priority: 'High', category: 'Essential', isBuffer: true, isRecurring: false },
    { id: 'gym', name: 'Gym Membership', target: 70, saved: 0, priority: 'High', category: 'Essential', isBuffer: false, isRecurring: true, monthlyCost: 70 },
    { id: 'g1', name: 'Pixel 9a', target: 1500, saved: 0, priority: 'High', category: 'Productivity', isRecurring: false },
    { id: 'g2', name: 'Desk Chair', target: 600, saved: 0, priority: 'Medium', category: 'Comfort', isRecurring: false },
    { id: 'g3', name: 'Jeans', target: 160, saved: 0, priority: 'Medium', category: 'Comfort', isRecurring: false },
  ],
  incomeEvents: [],
  settings: { currency: 'TND' },
};

// ─── Load / persist ───────────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      // Migration: combine balance back into buffer if it exists
      if (s.balance !== undefined) {
        const buf = s.goals.find(g => g.isBuffer);
        if (buf) buf.saved += s.balance;
        delete s.balance;
        delete s.monthlyTransferred;
        delete s.transferResetMonth;
      }
      // Sync buffer target on load
      s.goals = s.goals.map(g => g.isBuffer ? { ...g, target: calculateBufferTarget(s) } : g);
      return s;
    }
  } catch { }
  const fresh = JSON.parse(JSON.stringify(defaultState));
  fresh.goals = fresh.goals.map(g => g.isBuffer ? { ...g, target: calculateBufferTarget(fresh) } : g);
  return fresh;
}

function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { }
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, action) {
  let next;
  const thisMonth = new Date().toISOString().slice(0, 7);

  // Check for month reset at top level
  const base = state.monthly.resetDate !== thisMonth ? state : state; // Placeholder for now

  switch (action.type) {
    case 'SET_CASH':
      next = { ...base, cash: Math.max(0, action.value) };
      break;

    case 'ADD_GOAL':
      next = { ...base, goals: [...base.goals, { id: uid(), saved: 0, isBuffer: false, isRecurring: false, monthlyCost: 0, ...action.goal }] };
      break;

    case 'EDIT_GOAL':
      next = {
        ...base,
        goals: base.goals.map(g => g.id === action.id ? {
          ...g,
          ...action.updates,
          monthlyCost: (action.updates.isRecurring || g.isRecurring)
            ? (action.updates.monthlyCost ?? g.monthlyCost ?? action.updates.target ?? g.target)
            : 0
        } : g)
      };
      break;

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
      const inc = { id: uid(), source: action.source, amount: action.amount, date: new Date().toISOString() };
      next = {
        ...base,
        cash: base.cash + action.amount,
        incomeEvents: [inc, ...base.incomeEvents],
      };
      break;
    }

    case 'ALLOCATE_INCOME': {
      let pool = action.amount;
      const goals = base.goals.map(g => ({ ...g }));
      const essentials = monthlyEssentials(base);

      // 1. Survival: Fill Buffer up to monthly essentials first
      const buf = goals.find(g => g.isBuffer);
      if (buf) {
        const neededForSurvival = Math.max(0, essentials - buf.saved);
        const toSurvival = Math.min(neededForSurvival, pool);
        buf.saved += toSurvival;
        pool -= toSurvival;
      }

      // 2. Disciplined Installments: Fund monthly saving targets for each goal
      goals.filter(g => !g.isBuffer && g.saved < g.target).forEach(g => {
        const plan = getMonthlySaving(g);
        if (plan && plan.needed > 0) {
          const installment = Math.min(plan.needed, pool, g.target - g.saved);
          g.saved += installment;
          pool -= installment;
        }
      });

      // 3. Greedy Fill: Extra remains go to high-priority targets
      const order = { High: 0, Medium: 1, Low: 2 };
      goals.filter(g => !g.isBuffer && g.saved < g.target)
        .sort((a, b) => order[a.priority] - order[b.priority])
        .forEach(g => {
          const fill = Math.min(g.target - g.saved, pool);
          g.saved += fill;
          pool -= fill;
        });

      // 4. Final Remaining goes to Buffer (for safety milestones) if not already full
      if (buf && pool > 0) {
        const toBuffer = Math.min(buf.target - buf.saved, pool);
        buf.saved += toBuffer;
        pool -= toBuffer;
      }

      const bufAfter = goals.find(g => g.isBuffer);
      const maxMonths = base.bufferMaxMonths || 12;
      const leveledUp = !!(bufAfter && bufAfter.target > 0 && bufAfter.saved >= bufAfter.target && base.safetyMonths < maxMonths);

      const inc = { id: uid(), source: action.source, amount: action.amount, date: new Date().toISOString() };
      next = {
        ...base,
        cash: base.cash + pool,
        goals,
        bufferLeveledUp: leveledUp || base.bufferLeveledUp,
        incomeEvents: [inc, ...base.incomeEvents],
      };
      break;
    }

    case 'DISMISS_BUFFER_LEVELUP': {
      const newMonths = Math.min((base.safetyMonths || 3) + 1, base.bufferMaxMonths || 12);
      next = { ...base, bufferLeveledUp: false, safetyMonths: newMonths };
      break;
    }

    case 'SET_BUFFER_MAX':
      // The user can freely choose the ceiling. If the current safety months is higher, we cap safety months.
      next = {
        ...base,
        bufferMaxMonths: action.value,
        safetyMonths: Math.min(base.safetyMonths, action.value)
      };
      break;

    case 'SET_MONTHLY_BUDGET':
      next = { ...base, monthly: { ...base.monthly, budget: action.value } };
      break;

    case 'SET_SAFETY_MONTHS':
      next = { ...base, safetyMonths: action.value, bufferLeveledUp: false };
      break;

    case 'ADD_EXPENSE': {
      const exp = { id: uid(), name: action.name, amount: action.amount, date: new Date().toISOString() };
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
  }
  return next || base;
}

const StoreContext = createContext();

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, loadState);
  useEffect(() => { saveState(state); }, [state]);
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore() { return useContext(StoreContext); }
