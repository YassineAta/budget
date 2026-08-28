import { describe, it, expect } from 'vitest';
import { calculateBufferTarget, monthlyEssentials, formatTargetDate, parseGoalDate, toDateInputValue, getMonthlySaving } from './storeUtils';

/** Build a YYYY-MM-DD string offset from today (UTC) by `deltaDays`. */
function isoDaysFromToday(deltaDays) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + deltaDays));
  return d.toISOString().slice(0, 10);
}

// Helpers to build state fixtures using the new recurringExpenses model
function makeState({ budget = 300, safetyMonths, recurringExpenses = [], goals = [] } = {}) {
    return { monthly: { budget }, safetyMonths, recurringExpenses, goals };
}

function rec(amount, period = 'monthly', active = true) {
    const now = new Date().toISOString();
    return { id: 'r1', name: 'Test', amount, period, active, start_date: now, last_applied_date: now };
}

describe('storeUtils', () => {
    describe('formatTargetDate', () => {
        it('formats YYYY-MM to short month and year', () => {
            const formatted = formatTargetDate('2025-06');
            expect(formatted).toMatch(/2025/);
            expect(formatted.length).toBeGreaterThan(4);
        });
        it('returns empty string for empty input', () => {
            expect(formatTargetDate('')).toBe('');
        });
        it('includes the day for full YYYY-MM-DD dates', () => {
            const formatted = formatTargetDate('2026-08-15');
            expect(formatted).toMatch(/15/);
            expect(formatted).toMatch(/2026/);
        });
    });

    describe('parseGoalDate (day-level dates)', () => {
        it('parses a full YYYY-MM-DD as that exact UTC day', () => {
            const d = parseGoalDate('2026-08-15');
            expect(d.getUTCFullYear()).toBe(2026);
            expect(d.getUTCMonth()).toBe(7); // August (0-based)
            expect(d.getUTCDate()).toBe(15);
        });
        it('treats a legacy YYYY-MM as the LAST day of that month', () => {
            expect(toDateInputValue('2026-02')).toBe('2026-02-28'); // 2026 not a leap year
            expect(toDateInputValue('2026-08')).toBe('2026-08-31');
        });
        it('returns null for empty / malformed input', () => {
            expect(parseGoalDate('')).toBeNull();
            expect(parseGoalDate('garbage')).toBeNull();
            expect(parseGoalDate(undefined)).toBeNull();
        });
    });

    describe('getMonthlySaving (day-accurate plan)', () => {
        it('flags a past date as overdue with negative days', () => {
            const plan = getMonthlySaving({ target: 1000, saved: 100, targetDate: isoDaysFromToday(-3) });
            expect(plan.status).toBe('overdue');
            expect(plan.days).toBeLessThan(0);
            expect(plan.needed).toBe(900); // full remaining
        });
        it('flags today as due-now with zero days', () => {
            const plan = getMonthlySaving({ target: 1000, saved: 100, targetDate: isoDaysFromToday(0) });
            expect(plan.status).toBe('due-now');
            expect(plan.days).toBe(0);
        });
        it('spreads a future deadline into installments with a positive countdown', () => {
            const plan = getMonthlySaving({ target: 1200, saved: 0, targetDate: isoDaysFromToday(120) });
            expect(plan.status).toBe('active');
            expect(plan.days).toBeGreaterThan(100);
            expect(plan.months).toBeGreaterThanOrEqual(2);
            expect(plan.needed).toBeLessThan(1200); // spread, not lump-sum
        });
        it('returns null for an undated or already-funded goal', () => {
            expect(getMonthlySaving({ target: 1000, saved: 0, targetDate: '' })).toBeNull();
            expect(getMonthlySaving({ target: 1000, saved: 1000, targetDate: isoDaysFromToday(30) })).toBeNull();
        });
    });

    describe('monthlyEssentials', () => {
        it('sums budget and active monthly recurring expenses', () => {
            const state = makeState({
                budget: 300,
                recurringExpenses: [
                    rec(50, 'monthly'),
                    rec(150, 'monthly'),
                ],
            });
            expect(monthlyEssentials(state)).toBe(500); // 300 + 50 + 150
        });

        it('handles missing monthly budget gracefully (defaults to 200)', () => {
            const state = { recurringExpenses: [rec(50)], goals: [] };
            expect(monthlyEssentials(state)).toBe(250); // 200 + 50
        });

        it('excludes inactive recurring expenses', () => {
            const state = makeState({
                budget: 300,
                recurringExpenses: [
                    rec(50, 'monthly', true),
                    rec(100, 'monthly', false), // inactive
                ],
            });
            expect(monthlyEssentials(state)).toBe(350); // 300 + 50 only
        });

        it('normalises weekly expenses to monthly equivalent', () => {
            const weeksPerMonth = 365.25 / 12 / 7;
            const state = makeState({
                budget: 200,
                recurringExpenses: [rec(70, 'weekly')],
            });
            const result = monthlyEssentials(state);
            expect(result).toBeCloseTo(200 + 70 * weeksPerMonth, 1);
        });

        it('returns just the budget when there are no recurring expenses', () => {
            const state = makeState({ budget: 200, recurringExpenses: [] });
            expect(monthlyEssentials(state)).toBe(200);
        });
    });

    describe('calculateBufferTarget', () => {
        it('multiplies essentials by safety months', () => {
            const state = makeState({ budget: 300, safetyMonths: 6 });
            expect(calculateBufferTarget(state)).toBe(1800);
        });

        it('uses default safety months (3) if not provided', () => {
            const state = makeState({ budget: 200 });
            expect(calculateBufferTarget(state)).toBe(600);
        });

        it('includes active recurring expenses in the target', () => {
            const state = makeState({
                budget: 200,
                safetyMonths: 3,
                recurringExpenses: [rec(100, 'monthly')],
            });
            expect(calculateBufferTarget(state)).toBe(900); // (200 + 100) * 3
        });

        it('falls back to declared essentials when there is no spending history', () => {
            // makeState has no monthly.expenses → weighted burn is null → the
            // buffer sits on the declared-essentials floor, unchanged from before.
            const state = makeState({ budget: 300, safetyMonths: 3 });
            expect(calculateBufferTarget(state)).toBe(900);
        });
        // The adaptive (realised-spend-driven) path is covered deterministically
        // by getWeightedMonthlyBurn tests, which pass an explicit asOf. It is not
        // re-tested here because calculateBufferTarget reads the real clock.
    });
});
