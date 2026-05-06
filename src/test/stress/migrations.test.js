/**
 * S3 — Historical-shape replay.
 *
 * Each fixture represents a real historical localStorage shape. loadState must
 * handle all of them without crashing and with correct invariants.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadState } from '../../store';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 3, 11, 12, 0, 0) });
});
afterEach(() => {
  vi.useRealTimers();
});

function setLS(obj) {
  localStorage.setItem('finplan_v6', JSON.stringify(obj));
}

function assertBasicInvariants(state, label) {
  expect(state, `[${label}] state not null`).toBeTruthy();
  expect(Array.isArray(state.goals), `[${label}] goals is array`).toBe(true);
  const buf = state.goals.find(g => g.isBuffer);
  expect(buf, `[${label}] buffer goal exists`).toBeTruthy();
  expect(buf.saved, `[${label}] buffer >= 0`).toBeGreaterThanOrEqual(0);
  expect(Array.isArray(state.recurringExpenses), `[${label}] recurringExpenses is array`).toBe(true);
}

describe('[S3] Historical shape replay', () => {
  it('legacyBalance: flat balance field migrates to buffer.saved', () => {
    setLS({
      balance: 500,
      cash: 100,
      monthly: { budget: 200, spent: 0, expenses: [], resetDate: '2026-04' },
      goals: [{ id: 'buffer', name: 'Buffer', target: 600, saved: 200, isBuffer: true, type: 'saving' }],
      recurringExpenses: [],
      incomeEvents: [],
      settings: { currency: 'TND' },
    });
    const { state, ok } = loadState();
    expect(ok).toBe(true);
    assertBasicInvariants(state, 'legacyBalance');
    const buf = state.goals.find(g => g.isBuffer);
    expect(buf.saved).toBe(700); // 200 + 500
  });

  it('preRecurring: state without recurringExpenses triggers v1→v2 migration', () => {
    setLS({
      cash: 0,
      monthly: { budget: 200, spent: 0, expenses: [], resetDate: '2026-04' },
      goals: [{ id: 'buffer', name: 'Buffer', target: 600, saved: 1000, isBuffer: true, type: 'saving' }],
      incomeEvents: [],
      settings: { currency: 'TND' },
    });
    const { state, ok } = loadState();
    expect(ok).toBe(true);
    assertBasicInvariants(state, 'preRecurring');
    expect(state.recurringExpenses).toBeDefined();
  });

  it('postM3Broken: exact-match last_applied_date === start_date is repaired', () => {
    const isoDate = new Date(2026, 2, 15).toISOString();
    setLS({
      cash: 0,
      monthly: { budget: 200, spent: 0, expenses: [], resetDate: '2026-04' },
      goals: [{ id: 'buffer', name: 'Buffer', target: 600, saved: 1000, isBuffer: true, type: 'saving' }],
      recurringExpenses: [{
        id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1,
        start_date: isoDate,
        last_applied_date: isoDate, // exact match = old bug
        active: true,
      }],
      incomeEvents: [],
      settings: { currency: 'TND' },
    });
    const { state, ok } = loadState();
    expect(ok).toBe(true);
    assertBasicInvariants(state, 'postM3Broken');
    // Recurring is projection-only now — no auto-deduction on load
    const buf = state.goals.find(g => g.isBuffer);
    expect(buf.saved).toBe(1000);
  });

  it('currentHealthy: fully migrated state loads with no changes', () => {
    setLS({
      schemaVersion: 6,
      cash: 0,
      monthly: { budget: 200, spent: 70, expenses: [{ id: 'e1', name: 'Gym', amount: 70, date: new Date(2026, 3, 1).toISOString(), isRecurring: true, recurringId: 'gym' }], resetDate: '2026-04' },
      goals: [{ id: 'buffer', name: 'Buffer', target: 600, saved: 930, isBuffer: true, type: 'saving' }],
      recurringExpenses: [{
        id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1,
        start_date: new Date(2026, 3, 5).toISOString(),
        last_applied_date: new Date(2026, 3, 1).toISOString(),
        active: true,
      }],
      incomeEvents: [],
      settings: { currency: 'TND' },
    });
    const { state, ok } = loadState();
    expect(ok).toBe(true);
    const buf = state.goals.find(g => g.isBuffer);
    expect(buf.saved).toBe(930); // no extra drain
  });

  it('drainedByBug1: auto-credit migration refunds duplicates', () => {
    // State after 3 refreshes with Bug 1: 3 duplicate entries for the same cut
    const apr1a = new Date(2026, 3, 1, 0).toISOString();
    const apr1b = new Date(2026, 3, 1, 1).toISOString();
    const apr1c = new Date(2026, 3, 1, 2).toISOString();
    setLS({
      schemaVersion: 5,
      cash: 0,
      monthly: {
        budget: 200, spent: 210, // 3 × 70
        expenses: [
          { id: 'e1', name: 'Gym', amount: 70, date: apr1a, isRecurring: true, recurringId: 'gym' },
          { id: 'e2', name: 'Gym', amount: 70, date: apr1b, isRecurring: true, recurringId: 'gym' },
          { id: 'e3', name: 'Gym', amount: 70, date: apr1c, isRecurring: true, recurringId: 'gym' },
        ],
        resetDate: '2026-04',
      },
      goals: [{ id: 'buffer', name: 'Buffer', target: 600, saved: 790, isBuffer: true, type: 'saving' }],
      recurringExpenses: [{
        id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1,
        start_date: new Date(2026, 3, 5).toISOString(),
        last_applied_date: new Date(2026, 3, 1).toISOString(),
        active: true,
      }],
      incomeEvents: [],
      settings: { currency: 'TND' },
    });

    const { state, ok } = loadState();
    expect(ok).toBe(true);
    assertBasicInvariants(state, 'drainedByBug1');
    const gymEntries = state.monthly.expenses.filter(e => e.recurringId === 'gym' && e.date.slice(0, 7) === '2026-04');
    expect(gymEntries.length).toBe(1); // 2 duplicates removed
    const buf = state.goals.find(g => g.isBuffer);
    expect(buf.saved).toBeGreaterThan(790); // refunded
  });

  it('wipedThenSaved: defaults state loads cleanly and ok=true (first-time user)', () => {
    // This represents a user who had their data wiped by Bug 2 and now has defaults
    localStorage.removeItem('finplan_v6'); // fresh start
    const { state, ok } = loadState();
    expect(ok).toBe(true);
    assertBasicInvariants(state, 'wipedThenSaved');
  });
});
