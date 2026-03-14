import { describe, it, expect } from 'vitest';
import { calculateProgress } from './math';

describe('calculateProgress', () => {
    it('calculates 0% correctly', () => {
        const result = calculateProgress(0, 100);
        expect(result.pct).toBe(0);
        expect(result.remaining).toBe(100);
        expect(result.isFunded).toBe(false);
        expect(result.barColor).toBe('red');
    });

    it('calculates exactly 50% correctly', () => {
        const result = calculateProgress(50, 100);
        expect(result.pct).toBe(50);
        expect(result.remaining).toBe(50);
        expect(result.isFunded).toBe(false);
        expect(result.barColor).toBe('yellow');
    });

    it('calculates 100% correctly', () => {
        const result = calculateProgress(100, 100);
        expect(result.pct).toBe(100);
        expect(result.remaining).toBe(0);
        expect(result.isFunded).toBe(true);
        expect(result.barColor).toBe('green');
    });

    it('handles over-funding correctly', () => {
        const result = calculateProgress(150, 100);
        expect(result.pct).toBe(150);
        expect(result.remaining).toBe(0);
        expect(result.isFunded).toBe(true);
        expect(result.barColor).toBe('green');
    });

    it('handles 0 target safely to prevent NaN/Infinity', () => {
        const result = calculateProgress(50, 0);
        expect(result.pct).toBe(0);
        expect(result.remaining).toBe(0);
        expect(result.isFunded).toBe(true);
    });
});
