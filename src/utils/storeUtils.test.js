import { describe, it, expect } from 'vitest';
import { calculateBufferTarget, monthlyEssentials, formatTargetDate } from './storeUtils';

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
    });
});
