import { describe, it, expect } from 'vitest';
import { calculateBufferTarget, monthlyEssentials } from './storeUtils';

describe('storeUtils', () => {
    describe('monthlyEssentials', () => {
        it('calculates correctly with budget and recurring targets', () => {
            const state = {
                monthly: { budget: 300 },
                goals: [
                    { isRecurring: true, monthlyCost: 50 },
                    { isRecurring: false, target: 100 }, // ignored
                    { isRecurring: true, monthlyCost: 150 },
                ]
            };
            expect(monthlyEssentials(state)).toBe(500); // 300 + 50 + 150
        });

        it('handles missing monthly budget gracefully', () => {
            const state = {
                goals: [{ isRecurring: true, monthlyCost: 50 }]
            };
            // Default budget is 200 based on the function structure
            expect(monthlyEssentials(state)).toBe(250);
        });
    });

    describe('calculateBufferTarget', () => {
        it('multiplies essentials by safety months', () => {
            const state = {
                monthly: { budget: 300 },
                safetyMonths: 6,
                goals: []
            };
            expect(calculateBufferTarget(state)).toBe(1800);
        });

        it('uses default safety months (3) if not provided', () => {
            const state = {
                monthly: { budget: 200 },
                goals: []
            };
            expect(calculateBufferTarget(state)).toBe(600);
        });
    });
});
