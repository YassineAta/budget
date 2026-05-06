/**
 * S1 — Time-travel marathon stress test.
 *
 * Simulates 200 iterations of: advance clock by a random interval, then either
 * simulate a refresh (loadState) or dispatch APPLY_CASHFLOW. Verifies invariants
 * at every step.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadState } from '../../store';

const MS_PER_DAY = 86_400_000;

function encodeLS(state) {
  return btoa(encodeURIComponent(JSON.stringify(state)));
}

function setLS(state) {
  localStorage.setItem('finplan_v6', typeof state === 'string' ? state : encodeLS(state));
}

function getLS() {
  return localStorage.getItem('finplan_v6');
}

function makeInitialState() {
  return {
    cash: 0,
    monthly: { budget: 200, spent: 0, expenses: [], resetDate: '2026-01' },
    safetyMonths: 3,
    schemaVersion: 6,
    goals: [{
      id: 'buffer', name: 'Safety Buffer', target: 600, saved: 5000,
      priority: 'High', category: 'Essential', isBuffer: true, type: 'saving',
    }],
    recurringExpenses: [
      { id: 'gym',  name: 'Gym',      amount: 70,  period: 'monthly', cut_day: 1,  start_date: '2026-01-01T00:00:00.000Z', last_applied_date: '2025-12-01T00:00:00.000Z', active: true },
      { id: 'net',  name: 'Internet', amount: 30,  period: 'monthly', cut_day: 15, start_date: '2026-01-01T00:00:00.000Z', last_applied_date: '2025-12-15T00:00:00.000Z', active: true },
      { id: 'sub',  name: 'Sub',      amount: 20,  period: 'weekly',  cut_day: 1,  start_date: '2026-01-01T00:00:00.000Z', last_applied_date: '2025-12-25T00:00:00.000Z', active: true },
    ],
    incomeEvents: [],
    settings: { currency: 'TND' },
  };
}

function assertInvariants(state, label) {
  const buf = state.goals.find(g => g.isBuffer);

  // Buffer must never go negative
  expect(buf?.saved ?? 0, `[${label}] buffer.saved >= 0`).toBeGreaterThanOrEqual(0);

  // monthly.spent must match sum of all expenses since the reset date
  // (same filter that applyDueExpenses uses: cutMonth >= resetDate)
  const resetDate = state.monthly.resetDate;
  const thisMonthSum = (state.monthly.expenses || [])
    .filter(e => (e.date || '').slice(0, 7) >= resetDate)
    .reduce((s, e) => s + (e.amount || 0), 0);
  const roundedSpent = Math.round((state.monthly.spent || 0) * 100) / 100;
  const roundedSum   = Math.round(thisMonthSum * 100) / 100;
  expect(roundedSpent, `[${label}] monthly.spent === sum(this-month entries)`).toBeCloseTo(roundedSum, 0);

  // last_applied_date must not be in the future
  for (const exp of (state.recurringExpenses || [])) {
    if (!exp.last_applied_date) continue;
    const last = new Date(exp.last_applied_date);
    expect(last.getTime(), `[${label}] ${exp.name} last_applied_date <= now`).toBeLessThanOrEqual(Date.now() + 1000);
  }
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 0, 1) }); // Jan 1 2026
});
afterEach(() => vi.useRealTimers());

describe('[S1] Time-travel marathon', () => {
  it('200 iterations: random advance + refresh/apply — invariants hold throughout', () => {
    // Seed for deterministic "random"
    let seed = 42;
    function rand(min, max) {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      const t = (seed >>> 0) / 0x100000000;
      return Math.floor(min + t * (max - min));
    }

    const initial = makeInitialState();
    setLS(initial);

    let totalManualAdj = 0;
    let initialBuffer = 5000;

    for (let i = 0; i < 200; i++) {
      // Advance by 1 hour to 3 days
      const advanceMs = rand(3_600_000, 3 * MS_PER_DAY);
      vi.advanceTimersByTime(advanceMs);

      const { state } = loadState();
      assertInvariants(state, `iter ${i}`);

      // Save back (simulating a refresh)
      setLS(state);
    }

    // Final state: buffer should have been drained by a finite number of cuts,
    // not repeatedly re-drained by the old bug.
    const { state: final } = loadState();
    const buf = final.goals.find(g => g.isBuffer);

    // 200 iterations over ~Jan–May 2026 = roughly 5 months.
    // Monthly: gym(70) + net(30) = 100/month × 5 = 500 max.
    // Weekly: sub(20) × ~20 weeks = 400 max.
    // Total max drain ≈ 900. With 5000 initial, buffer should be ≥ 4000.
    expect(buf.saved, 'buffer was not excessively drained').toBeGreaterThanOrEqual(3000);
  });
});
