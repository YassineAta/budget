/**
 * S6 — Clock skew / backward-time jumps.
 *
 * Verifies that applyDueExpenses behaves safely when the system clock appears
 * to jump backward. Scenarios tested:
 *   - 5-minute jump back
 *   - 1-hour jump back
 *   - 1-day jump back
 *   - 30-day jump back (extreme — e.g., DST or NTP correction)
 *
 * Invariants that must hold after a backward jump:
 *   1. applyDueExpenses never throws
 *   2. last_applied_date is never overwritten with an earlier value
 *   3. buffer.saved never spontaneously increases
 *   4. No new ledger entries are added when time moves backward
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyDueExpenses } from '../../utils/cashflow';
import { loadState } from '../../store';

beforeEach(() => vi.useFakeTimers({ now: new Date(Date.UTC(2026, 3, 11, 12, 0, 0)) }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeState(lastApplied) {
  return {
    cash: 0,
    monthly: { budget: 200, spent: 70, expenses: [], resetDate: '2026-04' },
    safetyMonths: 3,
    schemaVersion: 6,
    goals: [{ id: 'buffer', name: 'Safety Buffer', target: 600, saved: 930, isBuffer: true, type: 'saving' }],
    recurringExpenses: [{
      id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1,
      start_date: '2026-04-05T00:00:00.000Z',
      last_applied_date: lastApplied,
      active: true,
    }],
    incomeEvents: [],
    settings: { currency: 'TND' },
  };
}

describe('[S6] Clock skew — backward-time jumps', () => {
  const scenarios = [
    { label: '5 min back',  deltaMs: -5 * 60 * 1000 },
    { label: '1 hour back', deltaMs: -60 * 60 * 1000 },
    { label: '1 day back',  deltaMs: -24 * 60 * 60 * 1000 },
    { label: '30 days back', deltaMs: -30 * 24 * 60 * 60 * 1000 },
  ];

  for (const { label, deltaMs } of scenarios) {
    it(`[${label}] no crash, no new drain, last_applied_date not rewound`, () => {
      const lastApplied = '2026-04-01T00:00:00.000Z';
      const state = makeState(lastApplied);
      const bufBefore = state.goals.find(g => g.isBuffer).saved;

      // "now" is in the past relative to last_applied_date
      const skewedNow = new Date(Date.UTC(2026, 3, 1) + deltaMs).toISOString();

      let result;
      expect(() => { result = applyDueExpenses(state, skewedNow); }).not.toThrow();

      const gym = result.recurringExpenses.find(e => e.id === 'gym');
      const bufAfter = result.goals.find(g => g.isBuffer).saved;

      // last_applied_date must not regress
      expect(gym.last_applied_date >= lastApplied).toBe(true);

      // buffer must not increase (no spontaneous refund)
      expect(bufAfter).toBeLessThanOrEqual(bufBefore);

      // no new ledger entries when time goes backward
      const newEntries = result.monthly.expenses.filter(e => e.recurringId === 'gym');
      expect(newEntries.length).toBe(0);
    });
  }

  it('after backward jump, forward jump fires cuts normally', () => {
    const lastApplied = '2026-04-01T00:00:00.000Z';
    const state = makeState(lastApplied);

    // Backward first
    const backwardNow = '2026-03-15T00:00:00.000Z';
    const afterBackward = applyDueExpenses(state, backwardNow);

    // Should be idempotent (no cuts fired, state unchanged)
    expect(afterBackward).toBe(state); // same reference = no changes

    // Now forward to May 1 (next cut)
    const forwardNow = '2026-05-01T12:00:00.000Z';
    const afterForward = applyDueExpenses(afterBackward, forwardNow);

    const gym = afterForward.recurringExpenses.find(e => e.id === 'gym');
    const buf = afterForward.goals.find(g => g.isBuffer);

    // May 1 cut must have fired
    expect(gym.last_applied_date > lastApplied).toBe(true);
    expect(buf.saved).toBe(930 - 70); // 860
  });

  it('loadState with clock behind last_applied_date does not corrupt state', () => {
    const lastApplied = '2026-04-10T00:00:00.000Z';
    const state = makeState(lastApplied);
    state.monthly.expenses = [{
      id: 'e1', name: 'Gym', amount: 70,
      date: '2026-04-01T00:00:00.000Z',
      isRecurring: true, recurringId: 'gym',
    }];

    localStorage.setItem('finplan_v6', JSON.stringify(state));

    // Fake time set to Apr 5 — behind the last_applied_date of Apr 10
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 5, 0, 0, 0)));

    const { state: loaded, ok } = loadState();
    expect(ok).toBe(true);

    const gym = loaded.recurringExpenses.find(e => e.id === 'gym');
    const buf = loaded.goals.find(g => g.isBuffer);

    // last_applied_date must not regress
    expect(gym.last_applied_date >= lastApplied).toBe(true);

    // buffer must not spontaneously increase
    expect(buf.saved).toBeLessThanOrEqual(930);

    // only the original ledger entry, no new ones
    const gymEntries = loaded.monthly.expenses.filter(e => e.recurringId === 'gym');
    expect(gymEntries.length).toBe(1);
  });
});
