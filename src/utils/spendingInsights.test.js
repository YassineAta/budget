import { describe, it, expect } from 'vitest';
import {
  monthKey, categorize, groupByMonth, getMonthlySeries, getLearnedMonthlyBurn,
  getWeightedMonthlyBurn,
  getMonthOverMonth, getPaceSignal, getCategoryBreakdown, getAnomalies, getSpendingInsights,
} from './spendingInsights';

/** Build a ledger expense on a specific UTC day. */
function exp(name, amount, y, m /* 1-based */, d, extra = {}) {
  const date = new Date(Date.UTC(y, m - 1, d, 12)).toISOString();
  return { id: `${name}-${date}`, name, amount, date, ...extra };
}

// A reference "now" mid-month so pace math is exercised.
const NOW = new Date(Date.UTC(2026, 6, 15, 12)); // Jul 15 2026 (day 15 of 31)

describe('monthKey', () => {
  it('slices ISO string to YYYY-MM', () => {
    expect(monthKey('2026-04-05T10:00:00.000Z')).toBe('2026-04');
  });
  it('handles a Date', () => {
    expect(monthKey(new Date(Date.UTC(2026, 3, 5)))).toBe('2026-04');
  });
});

describe('categorize', () => {
  it('matches keywords case-insensitively', () => {
    expect(categorize({ name: 'Groceries' })).toBe('Groceries');
    expect(categorize({ name: 'morning COFFEE' })).toBe('Coffee');
    expect(categorize({ name: 'Taxi home' })).toBe('Transport');
    expect(categorize({ name: 'Pharmacy meds' })).toBe('Pharmacy');
  });
  it('recurring entries fall back to Bills', () => {
    expect(categorize({ name: 'Mystery', isRecurring: true })).toBe('Bills');
  });
  it('unknown one-off falls back to Other', () => {
    expect(categorize({ name: 'Zorblax widget' })).toBe('Other');
  });
});

describe('groupByMonth', () => {
  it('buckets and totals by UTC month', () => {
    const g = groupByMonth([
      exp('a', 10, 2026, 4, 1),
      exp('b', 5, 2026, 4, 20),
      exp('c', 7, 2026, 5, 3),
    ]);
    expect(g['2026-04'].total).toBe(15);
    expect(g['2026-04'].count).toBe(2);
    expect(g['2026-05'].total).toBe(7);
  });
  it('ignores malformed entries', () => {
    const g = groupByMonth([{ amount: 5 }, null, exp('ok', 3, 2026, 4, 1)]);
    expect(Object.keys(g)).toEqual(['2026-04']);
  });
});

describe('getMonthlySeries', () => {
  it('returns contiguous months including zero-fill', () => {
    const s = getMonthlySeries([exp('a', 100, 2026, 5, 10)], 4, NOW);
    expect(s.map(x => x.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07']);
    expect(s.find(x => x.month === '2026-05').total).toBe(100);
    expect(s.find(x => x.month === '2026-07').total).toBe(0);
  });
  it('crosses year boundaries correctly', () => {
    const s = getMonthlySeries([], 3, new Date(Date.UTC(2026, 0, 15))); // Jan 2026
    expect(s.map(x => x.month)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('getLearnedMonthlyBurn', () => {
  it('averages completed prior months, excluding the current partial month', () => {
    const ledger = [
      exp('x', 300, 2026, 4, 10), // Apr
      exp('y', 200, 2026, 5, 10), // May
      exp('z', 250, 2026, 6, 10), // Jun
      exp('now', 40, 2026, 7, 5),  // Jul (current, excluded)
    ];
    // avg(300,200,250) = 250
    expect(getLearnedMonthlyBurn(ledger, { asOf: NOW })).toBe(250);
  });
  it('returns null with no prior-month history', () => {
    expect(getLearnedMonthlyBurn([exp('now', 40, 2026, 7, 5)], { asOf: NOW })).toBeNull();
  });
  it('skips empty months rather than averaging in zeros', () => {
    const ledger = [exp('x', 300, 2026, 6, 10)]; // only Jun has data
    expect(getLearnedMonthlyBurn(ledger, { asOf: NOW })).toBe(300);
  });
});

describe('getWeightedMonthlyBurn', () => {
  it('weights recent completed months more heavily than older ones', () => {
    // Apr 100, May 100, Jun 400 (Jul current, excluded). With decay 0.5 over
    // 3 completed months the newest (Jun) dominates, so the weighted average
    // sits well above the flat mean of 200.
    const ledger = [
      exp('a', 100, 2026, 4, 10),
      exp('b', 100, 2026, 5, 10),
      exp('c', 400, 2026, 6, 10),
      exp('now', 40, 2026, 7, 5), // current, excluded
    ];
    const flat = getLearnedMonthlyBurn(ledger, { asOf: NOW }); // 200
    const weighted = getWeightedMonthlyBurn(ledger, { asOf: NOW });
    // weights newest→oldest: 1, .5, .25 → (400 + 50 + 25) / 1.75 ≈ 271.43
    expect(weighted).toBeCloseTo(271.43, 1);
    expect(weighted).toBeGreaterThan(flat);
  });
  it('excludes the current partial month', () => {
    const ledger = [
      exp('jun', 300, 2026, 6, 10),
      exp('now', 9999, 2026, 7, 5), // huge current month must not leak in
    ];
    expect(getWeightedMonthlyBurn(ledger, { asOf: NOW })).toBe(300);
  });
  it('returns null with no completed-month history', () => {
    expect(getWeightedMonthlyBurn([exp('now', 40, 2026, 7, 5)], { asOf: NOW })).toBeNull();
  });
  it('equals the single value when only one completed month has data', () => {
    expect(getWeightedMonthlyBurn([exp('jun', 250, 2026, 6, 10)], { asOf: NOW })).toBe(250);
  });
});

describe('getMonthOverMonth', () => {
  it('computes delta and pct from last two months', () => {
    const s = getMonthlySeries([
      exp('a', 200, 2026, 6, 10),
      exp('b', 250, 2026, 7, 10),
    ], 2, NOW);
    const mom = getMonthOverMonth(s);
    expect(mom.current).toBe(250);
    expect(mom.previous).toBe(200);
    expect(mom.delta).toBe(50);
    expect(mom.pct).toBe(25);
  });
  it('returns null pct when previous month was zero', () => {
    const s = getMonthlySeries([exp('b', 250, 2026, 7, 10)], 2, NOW);
    expect(getMonthOverMonth(s).pct).toBeNull();
  });
});

describe('getPaceSignal', () => {
  it('projects the partial month to full-month and flags below-pace', () => {
    // Jul: spent 40 by day 15/31 → projected ~82.7. Baseline avg(300,200,250)=250 → well below.
    const ledger = [
      exp('x', 300, 2026, 4, 10),
      exp('y', 200, 2026, 5, 10),
      exp('z', 250, 2026, 6, 10),
      exp('now', 40, 2026, 7, 5),
    ];
    const p = getPaceSignal(ledger, { asOf: NOW });
    expect(p.spentThisMonth).toBe(40);
    expect(p.baseline).toBe(250);
    expect(p.projectedMonthEnd).toBeCloseTo(40 / (15 / 31), 1);
    expect(p.status).toBe('below');
    expect(p.pct).toBeLessThan(-10);
  });
  it('flags above-pace when overspending', () => {
    const ledger = [
      exp('x', 100, 2026, 6, 10),
      exp('now', 200, 2026, 7, 5), // already 2x the baseline by day 15
    ];
    const p = getPaceSignal(ledger, { asOf: NOW });
    expect(p.status).toBe('above');
  });
  it('falls back to budget when no history, unknown when neither', () => {
    expect(getPaceSignal([], { asOf: NOW }).status).toBe('unknown');
    const p = getPaceSignal([exp('now', 300, 2026, 7, 5)], { asOf: NOW, budget: 100 });
    expect(p.baseline).toBe(100);
    expect(p.status).toBe('above');
  });
});

describe('getCategoryBreakdown', () => {
  it('totals current-month spend by category, sorted desc', () => {
    const ledger = [
      exp('Groceries', 90, 2026, 7, 2),
      exp('Coffee', 12, 2026, 7, 3),
      exp('Taxi', 30, 2026, 7, 4),
      exp('Groceries', 20, 2026, 7, 8),
      exp('Groceries', 999, 2026, 6, 1), // prior month, excluded
    ];
    const cats = getCategoryBreakdown(ledger, { asOf: NOW });
    expect(cats[0]).toEqual({ category: 'Groceries', total: 110, count: 2 });
    expect(cats.map(c => c.category)).toEqual(['Groceries', 'Transport', 'Coffee']);
  });
});

describe('getAnomalies', () => {
  it('flags a category spiking above its historical average', () => {
    const ledger = [
      // Coffee ~10/mo historically
      exp('Coffee', 10, 2026, 4, 5),
      exp('Coffee', 10, 2026, 5, 5),
      exp('Coffee', 10, 2026, 6, 5),
      // This month coffee blows up to 50
      exp('Coffee', 50, 2026, 7, 5),
    ];
    const a = getAnomalies(ledger, { asOf: NOW });
    const coffee = a.find(x => x.category === 'Coffee');
    expect(coffee).toBeTruthy();
    expect(coffee.direction).toBe('up');
    expect(coffee.current).toBe(50);
    expect(coffee.average).toBe(10);
    expect(coffee.pct).toBe(400);
  });
  it('returns [] with no prior history', () => {
    expect(getAnomalies([exp('Coffee', 50, 2026, 7, 5)], { asOf: NOW })).toEqual([]);
  });
  it('ignores trivial noise below minAmount', () => {
    const ledger = [
      exp('Coffee', 2, 2026, 6, 5),
      exp('Coffee', 6, 2026, 7, 5), // 3x but both tiny
    ];
    expect(getAnomalies(ledger, { asOf: NOW })).toEqual([]);
  });
});

describe('getSpendingInsights', () => {
  it('bundles a coherent snapshot from state', () => {
    const state = {
      monthly: {
        budget: 200,
        expenses: [
          exp('Groceries', 300, 2026, 4, 10),
          exp('Groceries', 200, 2026, 5, 10),
          exp('Groceries', 250, 2026, 6, 10),
          exp('Coffee', 40, 2026, 7, 5),
        ],
      },
    };
    const ins = getSpendingInsights(state, NOW);
    expect(ins.series).toHaveLength(6);
    expect(ins.learnedBurn).toBe(250);
    expect(ins.hasHistory).toBe(true);
    expect(ins.pace.status).toBe('below');
    expect(ins.categories[0].category).toBe('Coffee');
  });
  it('degrades gracefully on empty state', () => {
    const ins = getSpendingInsights({}, NOW);
    expect(ins.hasHistory).toBe(false);
    expect(ins.learnedBurn).toBeNull();
    expect(ins.anomalies).toEqual([]);
  });
});
