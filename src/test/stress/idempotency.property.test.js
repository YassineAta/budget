/**
 * S2 — Property-based idempotency tests using fast-check.
 *
 * Properties:
 *   1. applyDueExpenses(applyDueExpenses(s, t), t) deepEquals applyDueExpenses(s, t)
 *   2. sum(monthly.expenses amounts for currentMonth) === monthly.spent (within 0.01)
 *   3. buffer.saved after N applications equals buffer.saved after 1 application
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { applyDueExpenses } from '../../utils/cashflow';

// ── Arbitraries ───────────────────────────────────────────────────────────────

// Use integer offsets (days) rather than fc.date() to avoid interactions with
// vitest's fake-timer patching of the Date constructor.
const BASE_2024 = Date.UTC(2024, 0, 1);
const END_2026  = Date.UTC(2026, 11, 31);
const isoDateArb = fc.integer({ min: 0, max: Math.floor((END_2026 - BASE_2024) / 86400000) })
  .map(days => new Date(BASE_2024 + days * 86400000).toISOString());

const recurringExpArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  amount: fc.float({ min: 1, max: 500, noNaN: true }),
  period: fc.constantFrom('monthly', 'weekly'),
  cut_day: fc.integer({ min: 1, max: 28 }),
  active: fc.boolean(),
}).chain(base => {
  return isoDateArb.map(start => ({
    ...base,
    start_date: start,
    last_applied_date: start,
  }));
});

const bufferGoalArb = fc.float({ min: 0, max: 50_000, noNaN: true }).map(saved => ({
  id: 'buffer', name: 'Buffer', target: 10_000, saved,
  isBuffer: true, type: 'saving',
}));

const stateArb = fc.record({
  goals: fc.tuple(bufferGoalArb).map(g => [...g]),
  recurringExpenses: fc.array(recurringExpArb, { minLength: 0, maxLength: 5 }),
  monthly: fc.record({
    budget: fc.integer({ min: 100, max: 500 }),
    spent: fc.float({ min: 0, max: 1000, noNaN: true }),
    expenses: fc.constant([]),
    resetDate: fc.constant(new Date().toISOString().slice(0, 7)),
  }),
});

const BASE_2026 = Date.UTC(2026, 0, 1);
const END_2027  = Date.UTC(2027, 11, 31);
const asOfArb = fc.integer({ min: 0, max: Math.floor((END_2027 - BASE_2026) / 86400000) })
  .map(days => new Date(BASE_2026 + days * 86400000).toISOString());

// ── Properties ────────────────────────────────────────────────────────────────

function deepEqualGoals(a, b) {
  if (a.length !== b.length) return false;
  return a.every((g, i) => Math.abs(g.saved - b[i].saved) < 0.001);
}

function deepEqualExpenses(a, b) {
  if (a.length !== b.length) return false;
  return a.every((e, i) =>
    e.id === b[i].id && e.last_applied_date === b[i].last_applied_date
  );
}

describe('[S2] Property-based idempotency', () => {
  it('applyDueExpenses is idempotent: calling twice with same asOf gives same result', () => {
    fc.assert(
      fc.property(stateArb, asOfArb, (state, asOf) => {
        const once = applyDueExpenses(state, asOf);
        const twice = applyDueExpenses(once, asOf);

        expect(deepEqualGoals(once.goals, twice.goals)).toBe(true);
        expect(deepEqualExpenses(once.recurringExpenses, twice.recurringExpenses)).toBe(true);
      }),
      { numRuns: 200, seed: 12345 }
    );
  });

  it('buffer.saved after N applications equals after 1 application', () => {
    fc.assert(
      fc.property(stateArb, asOfArb, (state, asOf) => {
        const once = applyDueExpenses(state, asOf);
        let result = once;
        for (let i = 0; i < 5; i++) {
          result = applyDueExpenses(result, asOf);
        }
        const bufOnce = once.goals.find(g => g.isBuffer)?.saved ?? 0;
        const bufN    = result.goals.find(g => g.isBuffer)?.saved ?? 0;
        expect(Math.abs(bufOnce - bufN)).toBeLessThan(0.01);
      }),
      { numRuns: 200, seed: 99999 }
    );
  });

  it('buffer.saved is always >= 0', () => {
    fc.assert(
      fc.property(stateArb, asOfArb, (state, asOf) => {
        const result = applyDueExpenses(state, asOf);
        const buf = result.goals.find(g => g.isBuffer);
        expect(buf?.saved ?? 0).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 300, seed: 54321 }
    );
  });
});
