import { createContext, useContext, useReducer, useEffect, useRef, useMemo } from 'react';
import { validateState, CURRENT_SCHEMA_VERSION } from './schema';
import { rootReducer } from './reducers/index';
import { calculateBufferTarget, uid } from './utils/storeUtils';
export * from './utils/storeUtils';

const STORAGE_KEY = 'finplan_v6';

// ─── Default state ────────────────────────────────────────────────────────────
const _now = new Date().toISOString();
const defaultState = {
  cash: 0,
  monthly: { budget: 200, spent: 0, expenses: [], resetDate: new Date().toISOString().slice(0, 7) },
  safetyMonths: 3,
  schemaVersion: CURRENT_SCHEMA_VERSION,
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

// Keep at most 5 pre-migration snapshots so localStorage doesn't bloat.
const MAX_SNAPSHOTS = 5;
const SNAPSHOT_PREFIX = 'finplan_v6_predmigration_';

function pruneOldSnapshots() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SNAPSHOT_PREFIX)) keys.push(k);
    }
    keys.sort(); // ISO timestamps sort lexicographically
    while (keys.length >= MAX_SNAPSHOTS) {
      localStorage.removeItem(keys.shift());
    }
  } catch { /* storage errors are non-fatal */ }
}

function savePreMigrationSnapshot(raw) {
  try {
    pruneOldSnapshots();
    const key = `${SNAPSHOT_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}`;
    localStorage.setItem(key, raw);
  } catch { /* non-fatal */ }
}

/**
 * List all available backup/snapshot keys sorted newest-first.
 * Exported so the recovery UI in App.jsx can display them.
 */
export function listSnapshots() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(SNAPSHOT_PREFIX) || k.startsWith('finplan_v6_backup_'))) {
        keys.push(k);
      }
    }
  } catch { /* non-fatal */ }
  return keys.sort().reverse(); // newest first
}

/**
 * Restore a snapshot: copy its bytes to the main key and reload.
 */
export function restoreSnapshot(key) {
  try {
    const bytes = localStorage.getItem(key);
    if (bytes) {
      localStorage.setItem(STORAGE_KEY, bytes);
      window.location.reload();
    }
  } catch (e) {
    console.error('[store] restoreSnapshot failed:', e);
  }
}

/**
 * Download the current state as a portable JSON backup file.
 */
export function exportToFile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.alert('Nothing to export — no data saved yet.');
      return;
    }
    const state = decodeData(raw);
    const payload = {
      app: 'finplan',
      schemaVersion: state.schemaVersion ?? CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finplan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('[store] exportToFile failed:', e);
    window.alert('Export failed: ' + (e?.message || e));
  }
}

/**
 * Import a backup file (JSON), validate, snapshot current state, then overwrite.
 */
export function importFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        const state = payload?.state ?? payload;
        try {
          validateState(state);
        } catch (validationErr) {
          window.alert('Backup file is invalid:\n' + (validationErr?.message || validationErr));
          return reject(validationErr);
        }
        if (!window.confirm('This will overwrite your current data with the backup. A snapshot of the current state will be saved so you can undo via Recover Data. Continue?')) {
          return reject(new Error('cancelled'));
        }
        const currentRaw = localStorage.getItem(STORAGE_KEY);
        if (currentRaw) {
          try {
            pruneOldSnapshots();
            const key = `${SNAPSHOT_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}`;
            localStorage.setItem(key, currentRaw);
          } catch { /* non-fatal */ }
        }
        localStorage.setItem(STORAGE_KEY, encodeData(state));
        window.location.reload();
        resolve();
      } catch (e) {
        console.error('[store] importFromFile failed:', e);
        window.alert('Import failed: ' + (e?.message || e));
        reject(e);
      }
    };
    reader.readAsText(file);
  });
}

/**
 * loadState — parses localStorage, runs versioned migrations, applies cashflow.
 *
 * Returns { state, ok, error }:
 *   ok=true  → state is valid migrated data; normal saves are allowed.
 *   ok=false → state is fresh defaults because something failed; StoreProvider
 *              MUST suppress the first save to avoid overwriting real data.
 */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // No data yet — first-time user. ok=true so the default state is persisted normally.
      const fresh = buildFreshState();
      return { state: fresh, ok: true, error: null };
    }

    // ── Save a pre-migration snapshot before touching anything ────────────────
    savePreMigrationSnapshot(raw);

    const parsed = decodeData(raw);

    // ── Reject future schema versions (downgrade protection) ──────────────────
    if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
      const err = new Error(`Data was saved by a newer version of the app (schemaVersion=${parsed.schemaVersion}). Please update the app.`);
      console.warn('[store] ' + err.message);
      return { state: buildFreshState(), ok: false, error: err };
    }

    let s = validateState(parsed);

    // ── v0→v1: legacy flat balance field ─────────────────────────────────────
    if ((s.schemaVersion ?? 0) < 1) {
      try {
        if (s.balance !== undefined) {
          const buf = s.goals.find(g => g.isBuffer);
          if (buf) buf.saved += s.balance;
          delete s.balance;
          delete s.monthlyTransferred;
          delete s.transferResetMonth;
        }
        s.schemaVersion = 1;
      } catch (e) {
        console.error('[store] migration v0→v1 failed:', e);
        throw e;
      }
    }

    // ── v1→v2: isRecurring goals → recurringExpenses ─────────────────────────
    // Data migration only runs if recurringExpenses is absent (original sentinel).
    // Existing data that already has recurringExpenses just gets the version bump.
    if ((s.schemaVersion ?? 0) < 2) {
      try {
        if (!s.recurringExpenses) {
          // Save a backup the first (and only) time this structural migration runs.
          const backupKey = `finplan_v6_backup_${new Date().toISOString().slice(0, 10)}`;
          if (!localStorage.getItem(backupKey)) {
            try { localStorage.setItem(backupKey, raw); } catch { /* quota */ }
          }

          const nowDate = new Date();
          const now = nowDate.toISOString();
          const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
          const migrated = [];
          s.goals = s.goals.filter(g => {
            if (g.isRecurring && !g.isBuffer) {
              const cutDay = 1;
              let year = nowDate.getFullYear();
              let month = nowDate.getMonth() - 1;
              if (month < 0) { month = 11; year -= 1; }
              const day = Math.min(cutDay, daysInMonth(year, month));
              const lastApplied = new Date(year, month, day).toISOString();
              migrated.push({
                id: g.id, name: g.name,
                amount: g.monthlyCost || g.target,
                period: 'monthly',
                cut_day: cutDay,
                start_date: now,
                last_applied_date: lastApplied,
                active: g.activeThisMonth !== false,
              });
              return false;
            }
            return true;
          });
          s.recurringExpenses = migrated;
        }
        s.schemaVersion = 2;
      } catch (e) {
        console.error('[store] migration v1→v2 failed:', e);
        throw e;
      }
    }

    // ── v2→v3: add cut_day to existing recurringExpenses ─────────────────────
    if ((s.schemaVersion ?? 0) < 3) {
      try {
        s.recurringExpenses = (s.recurringExpenses || []).map(e =>
          e.cut_day !== undefined ? e : { ...e, cut_day: 1 }
        );
        s.schemaVersion = 3;
      } catch (e) {
        console.error('[store] migration v2→v3 failed:', e);
        throw e;
      }
    }

    // ── v3→v4: fix last_applied_date === start_date (exact-match only) ───────
    //
    // OLD BUG: both dates were set to the same ISO string in one shot, causing
    // the engine to skip all past cuts. Fix: rewind last_applied_date to the
    // cut date one period before start_date so catch-up fires.
    //
    // ONLY the exact string-equality case is repaired. The previous "same month
    // of creation" heuristic (hasBrokenApplication) has been REMOVED because it
    // misidentified healthy post-fix state and caused an infinite deduct loop
    // (every refresh re-rewound and re-applied the same cut).
    if ((s.schemaVersion ?? 0) < 4) {
      try {
        const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
        s.recurringExpenses = (s.recurringExpenses || []).map(e => {
          if (!e.start_date || !e.last_applied_date) return e;
          // Only repair the exact-match legacy bug.
          if (e.last_applied_date !== e.start_date) return e;

          const start = new Date(e.start_date);
          if (e.period === 'monthly') {
            let year = start.getFullYear();
            let month = start.getMonth() - 1;
            if (month < 0) { month = 11; year -= 1; }
            const day = Math.min(e.cut_day || 1, daysInMonth(year, month));
            return { ...e, last_applied_date: new Date(year, month, day).toISOString() };
          } else if (e.period === 'weekly') {
            return { ...e, last_applied_date: new Date(start.getTime() - 7 * 86_400_000).toISOString() };
          }
          return e;
        });
        s.schemaVersion = 4;
      } catch (e) {
        console.error('[store] migration v3→v4 failed:', e);
        throw e;
      }
    }

    // ── v4→v5: log recovery for "hidden" deductions ──────────────────────────
    // If an expense was applied (last_applied_date > start_date) but is missing
    // from the current month's expenses list, recover it.
    if ((s.schemaVersion ?? 0) < 5) {
      try {
        const currentMonth = s.monthly?.resetDate || new Date().toISOString().slice(0, 7);
        const existingLogIds = new Set((s.monthly?.expenses || []).map(ex => ex.recurringId));

        // Guard against missing monthly.expenses
        if (s.monthly && !Array.isArray(s.monthly.expenses)) {
          s.monthly.expenses = [];
        }

        (s.recurringExpenses || []).forEach(e => {
          if (!e.active || !e.last_applied_date || !e.start_date) return;
          if (e.last_applied_date === e.start_date) return;

          const lastMonth = e.last_applied_date.slice(0, 7);
          if (lastMonth === currentMonth && !existingLogIds.has(e.id)) {
            s.monthly.expenses.push({
              id: uid(),
              name: e.name,
              amount: e.amount,
              date: e.last_applied_date,
              isRecurring: true,
              recurringId: e.id,
            });
            s.monthly.spent = Math.round(((s.monthly.spent || 0) + e.amount) * 100) / 100;
          }
        });
        s.schemaVersion = 5;
      } catch (e) {
        console.error('[store] migration v4→v5 failed:', e);
        throw e;
      }
    }

    // ── v5→v6: auto-credit duplicate recurring-cut entries (Bug-1 recovery) ──
    // Scans monthly.expenses for duplicate isRecurring entries with the same
    // recurringId within the same month. Keeps the first, refunds the rest
    // from the buffer, decrements monthly.spent. Only affects entries created
    // by applyDueExpenses (isRecurring:true) — manual ADD_EXPENSE entries lack
    // this flag and are never touched.
    if ((s.schemaVersion ?? 0) < 6) {
      try {
        const expenses = s.monthly?.expenses || [];
        // Group by (recurringId + month)
        const seen = new Map(); // key → first entry
        const duplicates = [];
        for (const ex of expenses) {
          if (!ex.isRecurring || !ex.recurringId) continue;
          const key = `${ex.recurringId}|${(ex.date || '').slice(0, 7)}`;
          if (!seen.has(key)) {
            seen.set(key, ex);
          } else {
            duplicates.push(ex);
          }
        }

        if (duplicates.length > 0) {
          const totalRefund = duplicates.reduce((sum, ex) => sum + (ex.amount || 0), 0);
          const roundedRefund = Math.round(totalRefund * 100) / 100;

          // Remove duplicate entries from the log
          const dupIds = new Set(duplicates.map(d => d.id));
          s.monthly.expenses = expenses.filter(ex => !dupIds.has(ex.id));
          s.monthly.spent = Math.max(0, Math.round(((s.monthly.spent || 0) - roundedRefund) * 100) / 100);

          // Credit back to the buffer
          const buf = s.goals?.find(g => g.isBuffer);
          if (buf) buf.saved = Math.round((buf.saved + roundedRefund) * 100) / 100;

          console.info(
            `[store] migration v5→v6: refunded ${duplicates.length} duplicate cut(s) totalling ${roundedRefund} ${s.settings?.currency || ''}`
          );
        }
        s.schemaVersion = 6;
      } catch (e) {
        console.error('[store] migration v5→v6 failed:', e);
        throw e;
      }
    }

    // ── Remove legacy flags ───────────────────────────────────────────────────
    delete s.bufferLeveledUp;

    // ── Recalculate buffer target ─────────────────────────────────────────────
    s.goals = s.goals.map(g => g.isBuffer ? { ...g, target: calculateBufferTarget(s) } : g);

    // Recurring expenses are projection-only — never auto-deducted on load.
    // The user logs them manually as expenses when actually paid.

    return { state: s, ok: true, error: null };

  } catch (err) {
    console.error('[store] loadState failed — keeping localStorage intact, using defaults:', err);
    // IMPORTANT: do NOT write anything to localStorage here. The caller (StoreProvider)
    // reads ok=false and suppresses the first save so real data is never overwritten.
    return { state: buildFreshState(), ok: false, error: err };
  }
}

function buildFreshState() {
  const fresh = JSON.parse(JSON.stringify(defaultState));
  fresh.goals = fresh.goals.map(g => g.isBuffer ? { ...g, target: calculateBufferTarget(fresh) } : g);
  return fresh;
}

function saveState(s) {
  try {
    localStorage.setItem(STORAGE_KEY, encodeData(s));
  } catch (e) {
    console.warn('[store] saveState failed (quota exceeded or sandboxed?):', e);
  }
}

const StoreContext = createContext();

export function StoreProvider({ children }) {
  // loadState is called exactly once per mount inside the useReducer init
  // function, which React calls synchronously before the first render.
  // We capture the full {state, ok, error} result in a ref so the effect
  // can read ok/error without calling loadState again.
  const loadRef = useRef(null);

  const [state, dispatch] = useReducer(rootReducer, null, () => {
    const result = loadState();
    loadRef.current = result;
    return result.state;
  });

  // hasSavedOnce:
  //   true  (loadOk=true)  → save normally on every state change, starting now.
  //   false (loadOk=false) → skip the very first save (would overwrite real data
  //                          with defaults), then allow all subsequent saves.
  const hasSavedOnce = useRef(loadRef.current?.ok ?? true);

  useEffect(() => {
    if (!hasSavedOnce.current) {
      hasSavedOnce.current = true;
      return;
    }
    saveState(state);
  }, [state]);

  const loadError = loadRef.current?.error ?? null;
  const value = useMemo(
    () => ({ state, dispatch, loadError }),
    [state, dispatch, loadError]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() { return useContext(StoreContext); }
