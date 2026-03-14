import { describe, it, expect } from 'vitest';
import { getRecommendation } from './financeAI';

describe('financeAI getRecommendation', () => {
    it('returns empty array when cash is 0', () => {
        expect(getRecommendation(0, [], 1000, 12)).toEqual([]);
    });

    it('prioritizes base safety net if under 3 months', () => {
        const goals = [{ isBuffer: true, saved: 1000 }]; // 1 month saved
        const recs = getRecommendation(5000, goals, 1000, 12);
        
        expect(recs.length).toBeGreaterThan(0);
        expect(recs[0].title).toContain('Base Safety');
        expect(recs[0].amount).toBe(2000); // Needs 2 more months to reach 3
    });

    it('allocates to high priority goals once 3 months safety is reached', () => {
        const goals = [
            { isBuffer: true, saved: 3000 }, // 3 months saved (exactly)
            { id: '1', priority: 'High', saved: 0, target: 1000 }
        ];
        
        const recs = getRecommendation(2000, goals, 1000, 12);
        expect(recs.length).toBeGreaterThan(0);
        expect(recs[0].title).toContain('Tackle High Priorities');
        // Since safety is ok (3 months) but not great (6 months), the ratio is 0.8
        expect(recs[0].amount).toBe(1000); // Fully funds the goal, max allowed by ratio 0.8 is 1600.
    });

    it('handles unbounded wealth when all goals and buffer are maxed out', () => {
        const goals = [
            { isBuffer: true, saved: 12000 }, 
            { priority: 'High', saved: 1000, target: 1000 }
        ];
        const recs = getRecommendation(5000, goals, 1000, 12);
        
        expect(recs.length).toBe(1);
        expect(recs[0].title).toBe('Unbound Wealth');
        expect(recs[0].amount).toBe(5000);
    });
});
