import { createContext, useContext, useReducer, useEffect } from 'react';

const STORAGE_KEY = 'finplan_v5';

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

// ─── Auto-top-up calculation ──────────────────────────────────────────────────
export function calcTopUpAmount(state) {
  const essentials = monthlyEssentials(state);
  const half = Math.round(essentials / 2);
  const day = new Date().getDate();
  const transfer = day <= 14 ? half : Math.max(0, essentials - state.monthlyTransferred);
  const bufferSaved = state.goals.find(g => g.isBuffer)?.saved || 0;
  return Math.min(transfer, bufferSaved);
}

// ─── Default state ────────────────────────────────────────────────────────────
const defaultState = {
  balance: 0,              // Current Balance (day-to-day spending money)
  cash: 0,                 // Free unallocated cash (before allocation)
  monthlyTransferred: 0,   // TND moved from buffer→balance this month
  transferResetMonth: new Date().toISOString().slice(0, 7),
  monthly: { budget: 200, spent: 0, expenses: [], resetDate: new Date().toISOString().slice(0, 7) },
  safetyMonths: 3,         // Current buffer coverage target (grows automatically)
  bufferMaxMonths: 12,     // Maximum months the buffer will grow to
  bufferLeveledUp: false,  // Flag set when buffer auto-grew (for Dashboard toast)
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
      // Ensure new fields exist (migration)
      if (s.balance === undefined) s.balance = s.cash || 0;
      if (s.monthlyTransferred === undefined) s.monthlyTransferred = 0;
      if (s.transferResetMonth === undefined) s.transferResetMonth = new Date().toISOString().slice(0, 7);
      if (s.bufferMaxMonths === undefined) s.bufferMaxMonths = 12;
      if (s.bufferLeveledUp === undefined) s.bufferLeveledUp = false;
      // Sync buffer target on load
      s.goals = s.goals.map(g => g.isBuffer ? { ...g, target: calculateBufferTarget(s) } : g);
      return s;
    }
  } catch { }
  // Fresh start — sync buffer target from defaultState too
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

  // Auto-reset monthlyTransferred on new month
  const thisMonth = new Date().toISOString().slice(0, 7);
  const base = state.transferResetMonth !== thisMonth
    ? { ...state, monthlyTransferred: 0, transferResetMonth: thisMonth }
    : state;

  switch (action.type) {

    // ── Balance & Cash ──────────────────────────────────────────────────────
    case 'SET_BALANCE':
      next = { ...base, balance: Math.max(0, action.value) };
      break;

    case 'SET_CASH':
      next = { ...base, cash: Math.max(0, action.value) };
      break;

    // ── Buffer Auto-Top-Up ──────────────────────────────────────────────────
    case 'TOP_UP_BALANCE': {
      const essentials = monthlyEssentials(base);
      const half = Math.round(essentials / 2);
      const day = new Date().getDate();
      const requested = day <= 14 ? half : Math.max(0, essentials - base.monthlyTransferred);
      const bufferGoal = base.goals.find(g => g.isBuffer);
      const available = bufferGoal?.saved || 0;
      const transfer = Math.min(requested, available);
      if (transfer <= 0) return { ...base, _toast: 'noFunds' };
      next = {
        ...base,
        balance: base.balance + transfer,
        monthlyTransferred: base.monthlyTransferred + transfer,
        goals: base.goals.map(g => g.isBuffer ? { ...g, saved: g.saved - transfer } : g),
        _toast: { type: 'topup', amount: transfer, bufferDepleted: transfer < requested },
      };
      break;
    }

    // ── Goals ───────────────────────────────────────────────────────────────
    case 'ADD_GOAL':
      next = { ...base, goals: [...base.goals, { id: uid(), saved: 0, isBuffer: false, isRecurring: false, monthlyCost: 0, ...action.goal }] };
      break;

    case 'EDIT_GOAL':
      next = {
        ...base,
        goals: base.goals.map(g => g.id === action.id ? {
          ...g,
          ...action.updates,
          // Re-calculate monthly cost if it's recurring and monthlyCost wasn't explicitly updated
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
      const totalAvailable = base.cash + base.balance;
      const amt = Math.min(action.amount, totalAvailable, goal.target - goal.saved);
      // Deduct from cash first, then balance
      const fromCash = Math.min(amt, base.cash);
      const fromBalance = amt - fromCash;
      next = {
        ...base,
        cash: base.cash - fromCash,
        balance: base.balance - fromBalance,
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
      const amt = Math.min(action.amount, from.saved, to.target - to.saved);
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

    // ── Income ──────────────────────────────────────────────────────────────
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
      // Greedy 3-step allocation
      let pool = action.amount;
      const goals = base.goals.map(g => ({ ...g }));

      // 1. Buffer first (always top priority)
      const buf = goals.find(g => g.isBuffer);
      if (buf) { const t = Math.min(buf.target - buf.saved, pool); buf.saved += t; pool -= t; }

      // 2. Recurring goals
      goals.filter(g => g.isRecurring).forEach(g => {
        const t = Math.min(g.target - g.saved, pool); g.saved += t; pool -= t;
      });

      // 3. Priority wishlist (greedy)
      const order = { High: 0, Medium: 1, Low: 2 };
      goals.filter(g => !g.isBuffer && !g.isRecurring && g.saved < g.target)
        .sort((a, b) => order[a.priority] - order[b.priority])
        .forEach(g => { const t = Math.min(g.target - g.saved, pool); g.saved += t; pool -= t; });

      // ── Flag buffer level-up (don't bump yet — wait for user to dismiss banner) ──
      // safetyMonths grows only when the user taps the banner, not immediately here
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
      // NOW bump safetyMonths — user has seen the milestone
      const newMonths = Math.min((base.safetyMonths || 3) + 1, base.bufferMaxMonths || 12);
      next = { ...base, bufferLeveledUp: false, safetyMonths: newMonths };
      break;
    }

    case 'SET_BUFFER_MAX':
      next = { ...base, bufferMaxMonths: Math.max(base.safetyMonths, action.value) };
      break;

    // ── Monthly spending ─────────────────────────────────────────────────────
    case 'SET_MONTHLY_BUDGET':
      next = { ...base, monthly: { ...base.monthly, budget: action.value } };
      break;

    case 'SET_SAFETY_MONTHS':
      next = { ...base, safetyMonths: action.value, bufferLeveledUp: false };
      break;

    case 'ADD_EXPENSE': {
      const exp = { id: uid(), name: action.name, amount: action.amount, date: new Date().toISOString() };
      next = {
        ...base,
        balance: Math.max(0, base.balance - action.amount),
        monthly: { ...base.monthly, spent: base.monthly.spent + action.amount, expenses: [...base.monthly.expenses, exp] },
      };
      break;
    }

    case 'DELETE_EXPENSE': {
      const exp = base.monthly.expenses.find(e => e.id === action.id);
      if (!exp) return base;
      next = {
        ...base,
        balance: base.balance + exp.amount,
        monthly: { ...base.monthly, spent: base.monthly.spent - exp.amount, expenses: base.monthly.expenses.filter(e => e.id !== action.id) },
      };
      break;
    }

    case 'RESET_MONTHLY':
      next = {
        ...base,
        goals: base.goals.map(g => g.isRecurring ? { ...g, saved: 0 } : g),
        monthly: { ...base.monthly, spent: 0, expenses: [], resetDate: thisMonth },
        monthlyTransferred: 0,
        transferResetMonth: thisMonth,
      };
      break;

    default:
      return base;
  }

  // Always re-sync buffer target
  if (next) {
    const bufTarget = calculateBufferTarget(next);
    next.goals = next.goals.map(g => g.isBuffer ? { ...g, target: bufTarget } : g);
  }

  return next || base;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const StoreContext = createContext();

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, loadState);
  useEffect(() => { saveState(state); }, [state]);
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore() { return useContext(StoreContext); }
