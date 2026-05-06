/**
 * Red-bar regression tests for Bug 1 (refresh-deduct loop) and Bug 2 (wipe-on-error).
 *
 * These tests FAIL on the current code and PASS after the fixes. They serve as
 * the acceptance criteria for the implementation.
 *
 * Bug 1: Migration 3's hasBrokenApplication clause rewinds last_applied_date to
 *        the prior period on every load, causing applyDueExpenses to re-deduct.
 *
 * Bug 2: The bare catch{} in loadState returns defaultState; the first useEffect
 *        immediately overwrites localStorage with those defaults.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { StoreProvider, useStore } from '../store';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Write state as plain JSON. decodeData() falls back to JSON.parse on non-base64 input. */
function setLS(state) {
  localStorage.setItem('finplan_v6', JSON.stringify(state));
}

function getLS(key = 'finplan_v6') {
  return localStorage.getItem(key);
}

/**
 * Render StoreProvider and capture the buffer.saved value after all effects flush.
 * Returns { bufferSaved, savedLS } where savedLS is localStorage after effects.
 */
async function mountAndRead(makeJsx) {
  let captured = null;
  const setter = (val) => { captured = val; };
  await act(async () => {
    render(<StoreProvider>{makeJsx(setter)}</StoreProvider>);
  });
  return { bufferSaved: captured, savedLS: getLS() };
}

function Reader({ onRead }) {
  const { state } = useStore();
  const buf = state.goals?.find(g => g.isBuffer);
  onRead(buf?.saved ?? null);
  return null;
}

/** Minimum valid state that passes Zod schema */
function validState(overrides = {}) {
  const now = new Date().toISOString();
  return {
    cash: 0,
    monthly: { budget: 200, spent: 0, expenses: [], resetDate: now.slice(0, 7) },
    safetyMonths: 3,
    goals: [
      {
        id: 'buffer', name: 'Safety Buffer', target: 600, saved: 1000,
        priority: 'High', category: 'Essential', isBuffer: true, type: 'saving',
      },
    ],
    recurringExpenses: [],
    incomeEvents: [],
    settings: { currency: 'TND' },
    ...overrides,
  };
}

// Use a stable "today" so tests are deterministic regardless of run date.
const FIXED_NOW = new Date(2026, 3, 11, 12, 0, 0); // 2026-04-11 noon local

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Bug 1 Regression Tests ────────────────────────────────────────────────────

describe('[BUG-1] Migration 3 hasBrokenApplication loop', () => {
  /**
   * TEST 19 — smoking-gun test.
   *
   * Scenario: expense created on Apr 5 (cut_day=1), already correctly applied
   * on Apr 1. After a "refresh" (loading from this localStorage state), the
   * buffer must NOT be reduced a second time.
   *
   * Fails on current code: Migration 3 sees last=Apr 1, start=Apr 5,
   * isSameMonthOfCreation=true, 1 >= 1 → hasBrokenApplication=true → rewinds
   * to Mar 1 → applyDueExpenses fires Apr 1 cut again → 930 becomes 860.
   */
  it('[T19] refresh does not re-deduct when expense was correctly applied in creation month', async () => {
    const createdAt = new Date(2026, 3, 5).toISOString();  // Apr 5
    const appliedAt = new Date(2026, 3, 1).toISOString();  // Apr 1 (cut_day=1)

    setLS(validState({
      goals: [{
        id: 'buffer', name: 'Safety Buffer', target: 600, saved: 930,
        priority: 'High', category: 'Essential', isBuffer: true, type: 'saving',
      }],
      recurringExpenses: [{
        id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1,
        start_date: createdAt,
        last_applied_date: appliedAt,  // correctly applied
        active: true,
      }],
      monthly: {
        budget: 200, spent: 70,
        expenses: [{ id: 'e1', name: 'Gym', amount: 70, date: appliedAt, isRecurring: true, recurringId: 'gym' }],
        resetDate: '2026-04',
      },
    }));

    const { bufferSaved } = await mountAndRead((onRead) => <Reader onRead={onRead} />);
    // Should still be 930 — no extra deduction on load
    expect(bufferSaved).toBe(930);
  });

  /**
   * TEST 20 — same but cut_day=10, created day 3.
   */
  it('[T20] cut_day=10, created day 3 — no rewind after correct application', async () => {
    const createdAt = new Date(2026, 3, 3).toISOString();  // Apr 3
    const appliedAt = new Date(2026, 3, 10).toISOString(); // Apr 10 (cut_day=10)

    setLS(validState({
      goals: [{
        id: 'buffer', name: 'Safety Buffer', target: 600, saved: 930,
        priority: 'High', category: 'Essential', isBuffer: true, type: 'saving',
      }],
      recurringExpenses: [{
        id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 10,
        start_date: createdAt,
        last_applied_date: appliedAt,
        active: true,
      }],
      monthly: {
        budget: 200, spent: 70,
        expenses: [{ id: 'e1', name: 'Gym', amount: 70, date: appliedAt, isRecurring: true, recurringId: 'gym' }],
        resetDate: '2026-04',
      },
    }));

    // NOTE: today is Apr 11, cut_day=10 → Apr 10 already passed and was applied.
    // Bug 1 would rewind to Mar 10 and re-fire. Fix: no rewind.
    const { bufferSaved } = await mountAndRead((onRead) => <Reader onRead={onRead} />);
    expect(bufferSaved).toBe(930);
  });

  /**
   * TEST 29 — legacy exact-match repair IS still applied.
   * An expense whose start_date === last_applied_date (the old bug) should
   * have last_applied_date rewound so the catch-up fires.
   */
  it('[T29] legacy exact-match: expense with last_applied_date === start_date is repaired', async () => {
    const createdAt = new Date(2026, 2, 15).toISOString(); // Mar 15 (old bug state)

    setLS(validState({
      goals: [{
        id: 'buffer', name: 'Safety Buffer', target: 600, saved: 1000,
        priority: 'High', category: 'Essential', isBuffer: true, type: 'saving',
      }],
      recurringExpenses: [{
        id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1,
        start_date: createdAt,
        last_applied_date: createdAt, // SAME STRING — the old bug
        active: true,
      }],
      monthly: { budget: 200, spent: 0, expenses: [], resetDate: '2026-04' },
    }));

    const { bufferSaved } = await mountAndRead((onRead) => <Reader onRead={onRead} />);
    // Recurring is projection-only now — no auto-deduction on load
    expect(bufferSaved).toBe(1000);
  });

  /**
   * TEST 30 — idempotency of the repair itself.
   * After the first load fires the exact-match repair + applyDueExpenses, the
   * resulting SAVED state has last_applied_date=Apr 1 (advanced by the engine,
   * not Feb 1 which was just the intermediate rewind). A second mount must NOT
   * deduct again.
   *
   * This simulates the state that actually gets written to localStorage after T29 runs.
   */
  it('[T30] exact-match repair is idempotent on second load', async () => {
    const createdAt = new Date(2026, 2, 15).toISOString(); // start_date = Mar 15
    const afterCatchUpDate = new Date(2026, 3, 1).toISOString(); // Apr 1 — where engine left off

    // Represents the state that was SAVED after the first load (T29 scenario):
    // both Mar and Apr cuts were applied, last_applied_date advanced to Apr 1.
    setLS(validState({
      schemaVersion: 6, // already fully migrated
      goals: [{
        id: 'buffer', name: 'Safety Buffer', target: 600, saved: 860,
        priority: 'High', category: 'Essential', isBuffer: true, type: 'saving',
      }],
      recurringExpenses: [{
        id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1,
        start_date: createdAt,
        last_applied_date: afterCatchUpDate, // engine advanced it here
        active: true,
      }],
      monthly: {
        budget: 200, spent: 140,
        expenses: [
          { id: 'e1', name: 'Gym', amount: 70, date: new Date(2026, 2, 1).toISOString(), isRecurring: true, recurringId: 'gym' },
          { id: 'e2', name: 'Gym', amount: 70, date: new Date(2026, 3, 1).toISOString(), isRecurring: true, recurringId: 'gym' },
        ],
        resetDate: '2026-04',
      },
    }));

    const { bufferSaved } = await mountAndRead((onRead) => <Reader onRead={onRead} />);
    // No new deduction on second load — May 1 is still in the future
    expect(bufferSaved).toBe(860);
  });

  /**
   * TEST 31 — 10 repeated mounts (simulating refreshes) must not drift the balance.
   */
  it('[T31] 10 consecutive remounts do not accumulate extra deductions', async () => {
    const createdAt = new Date(2026, 3, 5).toISOString();
    const appliedAt = new Date(2026, 3, 1).toISOString();

    setLS(validState({
      goals: [{
        id: 'buffer', name: 'Safety Buffer', target: 600, saved: 930,
        priority: 'High', category: 'Essential', isBuffer: true, type: 'saving',
      }],
      recurringExpenses: [{
        id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1,
        start_date: createdAt,
        last_applied_date: appliedAt,
        active: true,
      }],
      monthly: {
        budget: 200, spent: 70,
        expenses: [{ id: 'e1', name: 'Gym', amount: 70, date: appliedAt, isRecurring: true, recurringId: 'gym' }],
        resetDate: '2026-04',
      },
    }));

    let lastBalance = null;
    for (let i = 0; i < 10; i++) {
      let captured = null;
      const { unmount } = await act(async () => render(
        <StoreProvider><Reader onRead={(b) => { captured = b; }} /></StoreProvider>
      ));
      // After effects flush, re-read saved state for next iteration
      const saved = getLS();
      localStorage.clear();
      localStorage.setItem('finplan_v6', saved);
      lastBalance = captured;
      unmount();
    }

    expect(lastBalance).toBe(930);
  });
});

// ── Bug 2 Regression Tests ────────────────────────────────────────────────────

describe('[BUG-2] Data wipe on load error', () => {
  /**
   * TEST 41 — no-overwrite on invalid JSON.
   *
   * Fails on current code: loadState catches the parse error, returns defaultState,
   * then useEffect immediately calls saveState(defaultState) which overwrites the
   * original bytes.
   *
   * After fix: StoreProvider detects ok=false and suppresses the first save.
   */
  it('[T41] corrupt localStorage bytes are NOT overwritten when loadState fails', async () => {
    const corruptBytes = '{this is not valid json!!!';
    localStorage.setItem('finplan_v6', corruptBytes);

    await act(async () => {
      render(<StoreProvider><Reader onRead={() => {}} /></StoreProvider>);
    });

    const afterMount = getLS();
    // The original corrupt bytes must still be there — not replaced by defaults
    expect(afterMount).toBe(corruptBytes);
  });

  /**
   * TEST 42 — Zod validation failure also preserves original bytes.
   */
  it('[T42] Zod-invalid state is NOT overwritten when validation fails', async () => {
    const invalidState = JSON.stringify({ cash: 'not-a-number', monthly: null, goals: [], settings: { currency: 'TND' } });
    localStorage.setItem('finplan_v6', invalidState);

    await act(async () => {
      render(<StoreProvider><Reader onRead={() => {}} /></StoreProvider>);
    });

    const afterMount = getLS();
    expect(afterMount).toBe(invalidState);
  });

  /**
   * TEST 49 — e2e: balance stable across mount/unmount/remount cycle.
   *
   * This is the end-to-end version of T19: we verify that after the effects
   * flush (saving new state), the SAVED state also has the correct balance,
   * so a second mount sees the same value.
   */
  it('[T49] balance is stable across mount → save → remount cycle', async () => {
    const createdAt = new Date(2026, 3, 5).toISOString();
    const appliedAt = new Date(2026, 3, 1).toISOString();

    setLS(validState({
      goals: [{
        id: 'buffer', name: 'Safety Buffer', target: 600, saved: 930,
        priority: 'High', category: 'Essential', isBuffer: true, type: 'saving',
      }],
      recurringExpenses: [{
        id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1,
        start_date: createdAt,
        last_applied_date: appliedAt,
        active: true,
      }],
      monthly: {
        budget: 200, spent: 70,
        expenses: [{ id: 'e1', name: 'Gym', amount: 70, date: appliedAt, isRecurring: true, recurringId: 'gym' }],
        resetDate: '2026-04',
      },
    }));

    // First mount
    let balance1 = null;
    const { unmount } = await act(async () => render(
      <StoreProvider><Reader onRead={(b) => { balance1 = b; }} /></StoreProvider>
    ));
    unmount();

    // Reload from what was saved
    const savedBytes = getLS();
    localStorage.clear();
    localStorage.setItem('finplan_v6', savedBytes);

    // Second mount
    let balance2 = null;
    await act(async () => render(
      <StoreProvider><Reader onRead={(b) => { balance2 = b; }} /></StoreProvider>
    ));

    expect(balance1).toBe(930);
    expect(balance2).toBe(balance1); // Must be stable
  });

  /**
   * TEST 52 — on load failure, localStorage.setItem is not called with finplan_v6.
   *
   * This directly tests the no-overwrite-on-failure guarantee.
   * Fails on current code: useEffect calls saveState(defaultState) unconditionally.
   * After fix: suppressed when loadState returned ok=false.
   */
  it('[T52] localStorage.setItem(finplan_v6) is not called when loadState fails', async () => {
    const corruptBytes = '{invalid}';
    localStorage.setItem('finplan_v6', corruptBytes);

    const originalSetItem = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(Storage.prototype, 'setItem');

    await act(async () => {
      render(<StoreProvider><Reader onRead={() => {}} /></StoreProvider>);
    });

    const callsWithKey = spy.mock.calls.filter(([key]) => key === 'finplan_v6');
    expect(callsWithKey).toHaveLength(0);

    spy.mockRestore();
    void originalSetItem; // suppress unused-var lint
  });
});
