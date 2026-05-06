/**
 * S5 — Catastrophic-state replay.
 *
 * Simulates a state that accumulated Bug-1 damage over many refreshes
 * (up to 15 duplicate gym entries for the same month). Verifies that the
 * v5→v6 auto-credit migration:
 *   - removes all duplicate entries (keeps exactly one per month)
 *   - refunds the exact total back to the buffer
 *   - decrements monthly.spent correctly
 *   - handles the case where ALL entries are duplicates of the first
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadState } from '../../store';

beforeEach(() => vi.useFakeTimers({ now: new Date(2026, 3, 11, 12, 0, 0) }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function buildDamagedState(duplicateCount) {
  // Build `duplicateCount` gym entries all for April 2026, each with a slightly
  // different timestamp (simulating rapid successive refreshes).
  const entries = Array.from({ length: duplicateCount }, (_, i) => ({
    id: `e${i + 1}`,
    name: 'Gym',
    amount: 70,
    date: new Date(Date.UTC(2026, 3, 1, i)).toISOString(), // Apr 1 00:00, 01:00 … HH:00
    isRecurring: true,
    recurringId: 'gym',
  }));

  return {
    schemaVersion: 5, // trigger v5→v6 auto-credit
    cash: 0,
    monthly: {
      budget: 200,
      spent: duplicateCount * 70, // inflated by bug
      expenses: entries,
      resetDate: '2026-04',
    },
    safetyMonths: 3,
    goals: [{
      id: 'buffer', name: 'Safety Buffer', target: 600,
      saved: 5000 - duplicateCount * 70, // drained by bug
      isBuffer: true, type: 'saving',
    }],
    recurringExpenses: [{
      id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1,
      start_date: '2026-04-05T00:00:00.000Z',
      last_applied_date: '2026-04-01T00:00:00.000Z',
      active: true,
    }],
    incomeEvents: [],
    settings: { currency: 'TND' },
  };
}

describe('[S5] Catastrophic-state replay', () => {
  it('2 duplicate entries: 1 refunded, balance restored', () => {
    localStorage.setItem('finplan_v6', JSON.stringify(buildDamagedState(2)));
    const { state, ok } = loadState();
    expect(ok).toBe(true);
    const gymEntries = state.monthly.expenses.filter(e => e.recurringId === 'gym' && e.date.startsWith('2026-04'));
    expect(gymEntries.length).toBe(1);
    const buf = state.goals.find(g => g.isBuffer);
    expect(buf.saved).toBeGreaterThanOrEqual(5000 - 70); // at least (initial - 1 legitimate cut)
    expect(state.monthly.spent).toBe(70);
  });

  it('5 duplicate entries: 4 refunded, balance restored', () => {
    localStorage.setItem('finplan_v6', JSON.stringify(buildDamagedState(5)));
    const { state, ok } = loadState();
    expect(ok).toBe(true);
    const gymEntries = state.monthly.expenses.filter(e => e.recurringId === 'gym' && e.date.startsWith('2026-04'));
    expect(gymEntries.length).toBe(1);
    const buf = state.goals.find(g => g.isBuffer);
    expect(buf.saved).toBeGreaterThanOrEqual(5000 - 70);
    expect(state.monthly.spent).toBe(70);
  });

  it('15 duplicate entries: 14 refunded, exactly one remains', () => {
    localStorage.setItem('finplan_v6', JSON.stringify(buildDamagedState(15)));
    const { state, ok } = loadState();
    expect(ok).toBe(true);
    const gymEntries = state.monthly.expenses.filter(e => e.recurringId === 'gym' && e.date.startsWith('2026-04'));
    expect(gymEntries.length).toBe(1); // 14 duplicates removed
    const buf = state.goals.find(g => g.isBuffer);
    // initial buffer: 5000 - 15*70 = 3950. After refund of 14*70=980: 3950+980 = 4930
    expect(buf.saved).toBeCloseTo(4930, 0);
    expect(state.monthly.spent).toBe(70);
  });

  it('schemaVersion reaches CURRENT_SCHEMA_VERSION (6) after migration', () => {
    localStorage.setItem('finplan_v6', JSON.stringify(buildDamagedState(3)));
    const { state, ok } = loadState();
    expect(ok).toBe(true);
    expect(state.schemaVersion).toBe(6);
  });

  it('no manual ADD_EXPENSE entries are touched (no isRecurring flag)', () => {
    const state = buildDamagedState(3);
    // Add a manual expense alongside the duplicates
    state.monthly.expenses.push({ id: 'manual1', name: 'Coffee', amount: 5, date: '2026-04-05T10:00:00.000Z' });
    state.monthly.spent += 5;
    localStorage.setItem('finplan_v6', JSON.stringify(state));

    const { state: loaded } = loadState();
    const manual = loaded.monthly.expenses.find(e => e.id === 'manual1');
    expect(manual).toBeTruthy(); // preserved
    expect(manual.amount).toBe(5);
  });

  it('different recurringIds in same month: each keeps one entry', () => {
    const state = {
      schemaVersion: 5,
      cash: 0,
      monthly: {
        budget: 400, spent: 4 * 70 + 4 * 30,
        expenses: [
          // 4 gym duplicates
          { id: 'g1', name: 'Gym', amount: 70, date: '2026-04-01T00:00:00.000Z', isRecurring: true, recurringId: 'gym' },
          { id: 'g2', name: 'Gym', amount: 70, date: '2026-04-01T01:00:00.000Z', isRecurring: true, recurringId: 'gym' },
          { id: 'g3', name: 'Gym', amount: 70, date: '2026-04-01T02:00:00.000Z', isRecurring: true, recurringId: 'gym' },
          { id: 'g4', name: 'Gym', amount: 70, date: '2026-04-01T03:00:00.000Z', isRecurring: true, recurringId: 'gym' },
          // 4 net duplicates
          { id: 'n1', name: 'Net', amount: 30, date: '2026-04-15T00:00:00.000Z', isRecurring: true, recurringId: 'net' },
          { id: 'n2', name: 'Net', amount: 30, date: '2026-04-15T01:00:00.000Z', isRecurring: true, recurringId: 'net' },
          { id: 'n3', name: 'Net', amount: 30, date: '2026-04-15T02:00:00.000Z', isRecurring: true, recurringId: 'net' },
          { id: 'n4', name: 'Net', amount: 30, date: '2026-04-15T03:00:00.000Z', isRecurring: true, recurringId: 'net' },
        ],
        resetDate: '2026-04',
      },
      safetyMonths: 3,
      goals: [{ id: 'buffer', name: 'Safety Buffer', target: 600, saved: 2000, isBuffer: true, type: 'saving' }],
      recurringExpenses: [
        { id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1, start_date: '2026-04-05T00:00:00.000Z', last_applied_date: '2026-04-01T00:00:00.000Z', active: true },
        { id: 'net', name: 'Net', amount: 30, period: 'monthly', cut_day: 15, start_date: '2026-04-20T00:00:00.000Z', last_applied_date: '2026-04-15T00:00:00.000Z', active: true },
      ],
      incomeEvents: [],
      settings: { currency: 'TND' },
    };
    localStorage.setItem('finplan_v6', JSON.stringify(state));

    const { state: loaded, ok } = loadState();
    expect(ok).toBe(true);
    const gymEntries = loaded.monthly.expenses.filter(e => e.recurringId === 'gym');
    const netEntries = loaded.monthly.expenses.filter(e => e.recurringId === 'net');
    expect(gymEntries.length).toBe(1);
    expect(netEntries.length).toBe(1);
    // refunded: 3*70 + 3*30 = 300. buffer: 2000 + 300 = 2300
    const buf = loaded.goals.find(g => g.isBuffer);
    expect(buf.saved).toBeCloseTo(2300, 0);
    expect(loaded.monthly.spent).toBeCloseTo(100, 0); // 70 + 30
  });
});
