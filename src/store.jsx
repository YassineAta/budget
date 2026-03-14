import { createContext, useContext, useReducer, useEffect, useMemo } from 'react';
import { validateState } from './schema';
import { rootReducer } from './reducers/index';
import { calculateBufferTarget } from './utils/storeUtils';

export * from './utils/storeUtils';

const STORAGE_KEY = 'finplan_v6';

// ─── Default state ────────────────────────────────────────────────────────────
const defaultState = {
  cash: 0,                 
  monthly: { budget: 200, spent: 0, expenses: [], resetDate: new Date().toISOString().slice(0, 7) },
  safetyMonths: 3,         
  bufferMaxMonths: 12,     
  bufferLeveledUp: false,  
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
function encodeData(data) {
  return btoa(encodeURIComponent(JSON.stringify(data)));
}

function decodeData(str) {
  try {
    return JSON.parse(decodeURIComponent(atob(str)));
  } catch (e) {
    return JSON.parse(str); // Fallback for old unencoded data
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = decodeData(raw);
      const s = validateState(parsed);
      
      if (s.balance !== undefined) {
        const buf = s.goals.find(g => g.isBuffer);
        if (buf) buf.saved += s.balance;
        delete s.balance;
        delete s.monthlyTransferred;
        delete s.transferResetMonth;
      }
      s.goals = s.goals.map(g => g.isBuffer ? { ...g, target: calculateBufferTarget(s) } : g);

      const bufAfter = s.goals.find(g => g.isBuffer);
      const maxMonths = s.bufferMaxMonths || 12;
      if (bufAfter && bufAfter.target > 0 && bufAfter.saved >= bufAfter.target && (s.safetyMonths || 3) < maxMonths && !s.bufferLeveledUp) {
        s.bufferLeveledUp = true;
      }
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

  console.log('📦 Render: StoreProvider');
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() { return useContext(StoreContext); }
