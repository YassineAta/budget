import { describe, it, expect } from 'vitest';
import { rootReducer } from '../reducers/index';
import { applyDueExpenses } from '../utils/cashflow';

/**
 * Financial-integrity regression suite.
 *
 * Each test encodes a business INVARIANT the app must always satisfy, and most
 * are pinned to a specific critical bug found in the forensic audit. They drive
 * the reducer directly so they assert the source-of-truth transitions, not UI.
 */

const thisMonth = () => new Date().toISOString().slice(0, 7);

function makeState(over = {}) {
  return {
    cash: 0,
    monthly: { budget: 200, spent: 0, expenses: [], resetDate: thisMonth() },
    safetyMonths: 3,
    schemaVersion: 7,
    goals: [
      { id: 'buffer', name: 'Safety Buffer', target: 600, saved: 1000, isBuffer: true, type: 'saving' },
      { id: 'g1', name: 'Phone', target: 500, saved: 0, type: 'saving' },
    ],
    recurringExpenses: [],
    incomeEvents: [],
    settings: { currency: 'TND' },
    historicalSeasons: [],
    historicalGrowthRate: 0,
    ...over,
  };
}

const totalMoney = s => s.cash + s.goals.reduce((a, g) => a + g.saved, 0);
const buffer = s => s.goals.find(g => g.isBuffer);

describe('Invariant #1 — conservation of money (no mint / no destruction)', () => {
  it('over-budget expense caps at what exists AND delete refunds exactly (bug #1: mint-on-delete)', () => {
    let s = makeState({ cash: 0 });
    s.goals = [{ id: 'buffer', name: 'b', isBuffer: true, target: 600, saved: 30, type: 'saving' }];
    const before = totalMoney(s); // 30

    s = rootReducer(s, { type: 'ADD_EXPENSE', amount: 100, name: 'Rent' });
    expect(buffer(s).saved).toBe(0);                 // only what existed was taken
    const entry = s.monthly.expenses[0];
    expect(entry.paidFromBuffer).toBe(30);           // actual deduction recorded
    expect(entry.paidFromCash).toBe(0);

    s = rootReducer(s, { type: 'DELETE_EXPENSE', id: entry.id });
    expect(buffer(s).saved).toBe(30);                // refunds exactly 30, not 100
    expect(totalMoney(s)).toBe(before);              // ← the old code minted 70 here
  });

  it('full add→delete round-trip is a no-op on total money', () => {
    let s = makeState({ cash: 500 });
    const before = totalMoney(s);
    s = rootReducer(s, { type: 'ADD_EXPENSE', amount: 120, name: 'x' });
    const id = s.monthly.expenses[0].id;
    s = rootReducer(s, { type: 'DELETE_EXPENSE', id });
    expect(totalMoney(s)).toBe(before);
  });
});

describe('Invariant — expense payment model (cash-first, then buffer)', () => {
  it('pays entirely from cash while cash covers it, leaving the buffer untouched (bug #3)', () => {
    let s = makeState({ cash: 1000 });
    s.goals = [{ id: 'buffer', name: 'b', isBuffer: true, target: 600, saved: 500, type: 'saving' }];
    s = rootReducer(s, { type: 'ADD_EXPENSE', amount: 100, name: 'x' });
    expect(s.cash).toBe(900);
    expect(buffer(s).saved).toBe(500);
    expect(s.monthly.expenses[0].paidFromCash).toBe(100);
    expect(s.monthly.expenses[0].paidFromBuffer).toBe(0);
  });

  it('overflows into the buffer only for the shortfall', () => {
    let s = makeState({ cash: 40 });
    s.goals = [{ id: 'buffer', name: 'b', isBuffer: true, target: 600, saved: 500, type: 'saving' }];
    s = rootReducer(s, { type: 'ADD_EXPENSE', amount: 100, name: 'x' });
    expect(s.cash).toBe(0);
    expect(buffer(s).saved).toBe(440);               // 500 - 60
    expect(s.monthly.expenses[0].paidFromCash).toBe(40);
    expect(s.monthly.expenses[0].paidFromBuffer).toBe(60);
  });
});

describe('Invariant #5 — deleting income is a historical record, not a live reversal', () => {
  it('does not destroy money when the allocated goal was since drawn down (bug #2)', () => {
    let s = makeState({ cash: 0 });
    s.goals = [
      { id: 'buffer', name: 'b', isBuffer: true, target: 600, saved: 0, type: 'saving' },
      { id: 'g1', name: 'p', target: 500, saved: 100, type: 'saving' }, // was 500, spent down to 100
    ];
    s.incomeEvents = [{
      id: 'inc1', source: 'Salary', amount: 500, date: new Date().toISOString(),
      allocations: { g1: 500 }, cashAllocated: 0,
    }];
    const before = totalMoney(s); // 100

    s = rootReducer(s, { type: 'DELETE_INCOME', id: 'inc1' });
    expect(s.goals.find(g => g.id === 'g1').saved).toBe(100); // untouched — not clawed to 0
    expect(totalMoney(s)).toBe(before);                       // ← old code destroyed 100 here
  });

  it('reverses cleanly when the allocation is still fully present', () => {
    let s = makeState({ cash: 0 });
    s.goals = [
      { id: 'buffer', name: 'b', isBuffer: true, target: 600, saved: 0, type: 'saving' },
      { id: 'g1', name: 'p', target: 500, saved: 500, type: 'saving' },
    ];
    s.incomeEvents = [{
      id: 'inc1', source: 'S', amount: 500, date: new Date().toISOString(),
      allocations: { g1: 500 }, cashAllocated: 0,
    }];
    s = rootReducer(s, { type: 'DELETE_INCOME', id: 'inc1' });
    expect(s.goals.find(g => g.id === 'g1').saved).toBe(0);
  });

  it('does not resurrect money for a goal deleted before the income', () => {
    let s = makeState({ cash: 0 });
    s.goals = [
      { id: 'buffer', name: 'b', isBuffer: true, target: 600, saved: 0, type: 'saving' },
      { id: 'g1', name: 'p', target: 500, saved: 500, type: 'saving' },
    ];
    s.incomeEvents = [{
      id: 'inc1', source: 'S', amount: 500, date: new Date().toISOString(),
      allocations: { g1: 500 }, cashAllocated: 0,
    }];
    s = rootReducer(s, { type: 'DELETE_GOAL', id: 'g1' }); // saved returns to cash
    expect(s.cash).toBe(500);
    const before = totalMoney(s);
    s = rootReducer(s, { type: 'DELETE_INCOME', id: 'inc1' });
    expect(totalMoney(s)).toBe(before);
    expect(s.cash).toBe(500);
  });
});

describe('Invariant #6 — reducer-edge validation', () => {
  it('EDIT_GOAL rejects a non-finite target and keeps the prior value', () => {
    let s = makeState();
    s = rootReducer(s, { type: 'EDIT_GOAL', id: 'g1', updates: { target: NaN } });
    const g1 = s.goals.find(g => g.id === 'g1');
    expect(Number.isFinite(g1.target)).toBe(true);
    expect(g1.target).toBe(500);
  });

  it('ADD_EXPENSE ignores a non-finite / non-positive amount', () => {
    let s = makeState({ cash: 100 });
    const a = rootReducer(s, { type: 'ADD_EXPENSE', amount: NaN, name: 'x' });
    expect(a).toBe(s);
    const b = rootReducer(s, { type: 'ADD_EXPENSE', amount: -5, name: 'x' });
    expect(b).toBe(s);
  });

  it('SET_MONTHLY_BUDGET clamps a negative to 0', () => {
    let s = makeState();
    s = rootReducer(s, { type: 'SET_MONTHLY_BUDGET', value: -50 });
    expect(s.monthly.budget).toBe(0);
  });
});

describe('Invariant — wishlist goals hold no reserved money', () => {
  it('FUND_GOAL is a no-op on a wishlist goal', () => {
    let s = makeState({ cash: 500 });
    s.goals = [
      { id: 'buffer', name: 'b', isBuffer: true, target: 600, saved: 0, type: 'saving' },
      { id: 'w', name: 'wish', target: 500, saved: 0, type: 'wishlist' },
    ];
    const r = rootReducer(s, { type: 'FUND_GOAL', id: 'w', amount: 100 });
    expect(r).toBe(s);
  });

  it('MOVE_FUNDS cannot move money into a wishlist goal', () => {
    let s = makeState();
    s.goals = [
      { id: 'buffer', name: 'b', isBuffer: true, target: 600, saved: 0, type: 'saving' },
      { id: 'g1', name: 'p', target: 500, saved: 300, type: 'saving' },
      { id: 'w', name: 'wish', target: 500, saved: 0, type: 'wishlist' },
    ];
    const r = rootReducer(s, { type: 'MOVE_FUNDS', fromId: 'g1', toId: 'w', amount: 100 });
    expect(r).toBe(s);
  });
});

describe('Invariant #1 — PURCHASE_ITEM records a ledger entry (double-entry)', () => {
  it('logs the purchase, removes the goal money, and is non-refundable', () => {
    let s = makeState({ cash: 0 });
    s.goals = [
      { id: 'buffer', name: 'b', isBuffer: true, target: 600, saved: 0, type: 'saving' },
      { id: 'g1', name: 'Phone', target: 500, saved: 500, type: 'saving' },
    ];
    const before = totalMoney(s); // 500
    s = rootReducer(s, { type: 'PURCHASE_ITEM', id: 'g1' });
    expect(s.goals.find(g => g.id === 'g1')).toBeUndefined();
    const entry = s.monthly.expenses.find(e => e.isPurchase);
    expect(entry.amount).toBe(500);
    expect(entry.paidFromCash).toBe(0);
    expect(entry.paidFromBuffer).toBe(0);
    // Goal money was pre-allocated — it is logged but NOT counted as this month's spend.
    expect(s.monthly.spent).toBe(0);
    expect(totalMoney(s)).toBe(before - 500); // money left the system, logged

    // Deleting the purchase record must refund nothing (money already spent).
    s = rootReducer(s, { type: 'DELETE_EXPENSE', id: entry.id });
    expect(totalMoney(s)).toBe(before - 500);
  });
});

describe('Invariant #2 — recurring cuts conserve money and record their split', () => {
  it('applyDueExpenses pays cash-first and every entry carries a paid split', () => {
    const past = new Date(Date.now() - 40 * 86_400_000).toISOString();
    let s = makeState({ cash: 100 });
    s.goals = [{ id: 'buffer', name: 'b', isBuffer: true, target: 600, saved: 500, type: 'saving' }];
    s.recurringExpenses = [{
      id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1,
      start_date: past, last_applied_date: past, active: true,
    }];
    const before = s.cash + s.goals[0].saved;

    s = applyDueExpenses(s);
    const cuts = s.monthly.expenses.filter(e => e.isRecurring);
    expect(cuts.length).toBeGreaterThan(0);
    expect(cuts[0].paidFromCash).toBeGreaterThan(0); // cash consumed first

    const drained = cuts.reduce((a, e) => a + e.paidFromCash + e.paidFromBuffer, 0);
    // balances dropped by EXACTLY the recorded splits — nothing created or lost.
    expect(s.cash + s.goals[0].saved).toBeCloseTo(before - drained, 2);
  });
});
