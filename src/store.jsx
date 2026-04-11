import { createContext, useContext, useReducer, useEffect, useMemo } from 'react';
import { validateState } from './schema';
import { rootReducer } from './reducers/index';
import { calculateBufferTarget } from './utils/storeUtils';
import { applyDueExpenses } from './utils/cashflow';

export * from './utils/storeUtils';

const STORAGE_KEY = 'finplan_v6';

// ─── Default state ────────────────────────────────────────────────────────────
const _now = new Date().toISOString();
const defaultState = {
  cash: 0,
  monthly: { budget: 200, spent: 0, expenses: [], resetDate: new Date().toISOString().slice(0, 7) },
  safetyMonths: 3,
  goals: [
    { id: 'buffer', name: 'Safety Buffer', target: 0, saved: 0, priority: 'High', category: 'Essential', isBuffer: true, type: 'saving' },
    { id: 'g1', name: 'Pixel 9a', target: 1500, saved: 0, priority: 'High', category: 'Productivity', type: 'saving' },
    { id: 'g2', name: 'Desk Chair', target: 600, saved: 0, priority: 'Medium', category: 'Comfort', type: 'saving' },
    { id: 'g3', name: 'Jeans', target: 160, saved: 0, priority: 'Medium', category: 'Comfort', type: 'saving' },
  ],
  recurringExpenses: [
    { id: 'gym', name: 'Gym Membership', amount: 70, period: 'monthly', cut_day: 1, start_date: _now, last_applied_date: _now, active: true },
  ],
  incomeEvents: [],
  settings: { currency: 'TND' },
};

// ─── Load / persist ───────────────────────────────────────────────────────────
function encodeData(data) {
  return btoa(encodeURIComponent(JSON.stringify(data)));
}

function decodeData(str) {
  try {
    return JSON.parse(decodeURIComponent(atob(str)));
  } catch (e) {
    return JSON.parse(str);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = decodeData(raw);
      let s = validateState(parsed);

      // ── Legacy: flat balance field ─────────────────────────────────────────
      if (s.balance !== undefined) {
        const buf = s.goals.find(g => g.isBuffer);
        if (buf) buf.saved += s.balance;
        delete s.balance;
        delete s.monthlyTransferred;
        delete s.transferResetMonth;
      }

      // ── Migration 1: isRecurring goals → recurringExpenses ─────────────────
      // Runs exactly once (sentinel: !s.recurringExpenses).
      if (!s.recurringExpenses) {
        try {
          const backupKey = `finplan_v6_backup_${new Date().toISOString().slice(0, 10)}`;
          if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, raw);
        } catch { }

        const now = new Date().toISOString();
        const migrated = [];
        s.goals = s.goals.filter(g => {
          if (g.isRecurring && !g.isBuffer) {
            migrated.push({
              id: g.id, name: g.name,
              amount: g.monthlyCost || g.target,
              period: 'monthly',
              cut_day: 1,
              start_date: now,
              last_applied_date: now, // no retroactive drain
              active: g.activeThisMonth !== false,
            });
            return false;
          }
          return true;
        });
        s.recurringExpenses = migrated;
      }

      // ── Migration 2: add cut_day to existing recurringExpenses ─────────────
      s.recurringExpenses = s.recurringExpenses.map(e =>
        e.cut_day !== undefined ? e : { ...e, cut_day: 1 }
      );

      // ── Migration 3: fix last_applied_date set to creation time (old bug) ──
      // Expenses created with the old code had last_applied_date = creation time,
      // which blocked the engine from ever seeing past cut dates as pending.
      // We detect this by checking if last_applied_date is suspiciously close
      // (within same day) to start_date AND last_applied_date falls on or after
      // the expense's cut_day in the same month. If so, roll back one period.
      {
        const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
        s.recurringExpenses = s.recurringExpenses.map(e => {
          if (!e.start_date || !e.last_applied_date) return e;
          const start = new Date(e.start_date);
          const last = new Date(e.last_applied_date);
          // Only patch if last_applied_date is within 1 minute of start_date
          // (i.e. it was set to "now" at creation time, not by the engine)
          if (Math.abs(last - start) > 60_000) return e;
          if (e.period === 'monthly') {
            let year = last.getFullYear();
            let month = last.getMonth() - 1;
            if (month < 0) { month = 11; year -= 1; }
            const day = Math.min(e.cut_day || 1, daysInMonth(year, month));
            return { ...e, last_applied_date: new Date(year, month, day).toISOString() };
          } else if (e.period === 'weekly') {
            return { ...e, last_applied_date: new Date(last.getTime() - 7 * 86_400_000).toISOString() };
          }
          return e;
        });
      }

      // ── Remove legacy bufferLeveledUp flag if present ──────────────────────
      delete s.bufferLeveledUp;

      // ── Recalculate buffer target ──────────────────────────────────────────
      s.goals = s.goals.map(g => g.isBuffer ? { ...g, target: calculateBufferTarget(s) } : g);

      // ── Apply any due recurring cuts since last session ────────────────────
      s = applyDueExpenses(s);

      return s;
    }
  } catch { }

  const fresh = JSON.parse(JSON.stringify(defaultState));
  fresh.goals = fresh.goals.map(g => g.isBuffer ? { ...g, target: calculateBufferTarget(fresh) } : g);
  return fresh;
}

function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, encodeData(s)); } catch { }
}

const StoreContext = createContext();

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(rootReducer, null, loadState);
  useEffect(() => { saveState(state); }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() { return useContext(StoreContext); }
