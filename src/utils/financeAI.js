export function getRecommendation(cash, goals, essentials, maxDisplay) {
    if (cash <= 0) return [];

    let pool = cash;
    const recs = [];
    const bufferGoal = goals.find(g => g.isBuffer);
    const bufferMonths = essentials > 0 ? (bufferGoal?.saved || 0) / essentials : 0;

    // Principle 1: Base Safety Net (3 months minimum)
    if (bufferMonths < 3) {
        const neededFor3 = Math.max(0, (3 * essentials) - (bufferGoal?.saved || 0));
        const allocation = Math.min(neededFor3, pool);
        if (allocation > 0) {
            recs.push({ title: "Build Base Safety (Top Priority)", amount: allocation, reason: "Financial experts recommend prioritizing a 3-month emergency fund above all else to protect against sudden shocks." });
            pool -= allocation;
        }
    }

    // Principle 2: High Priority / Debt 
    const highGoals = goals.filter(g => !g.isBuffer && g.priority === 'High' && g.saved < g.target);
    if (pool > 0 && highGoals.length > 0) {
        // If safety is ok, push hard on high priority. If safety is great (>6mo), balance it.
        const ratio = bufferMonths >= 6 ? 0.5 : 0.8;
        const allocation = Math.min(pool * ratio, highGoals.reduce((s, g) => s + (g.target - g.saved), 0));
        if (allocation > 1) {
            recs.push({ title: "Tackle High Priorities", amount: Math.floor(allocation), reason: "With your baseline safety intact, aggressively fund your most critical goals (like debt or urgent upgrades)." });
            pool -= Math.floor(allocation);
        }
    }

    // Principle 3: Medium/Low Priority (The "Wants")
    const otherGoals = goals.filter(g => !g.isBuffer && g.priority !== 'High' && g.saved < g.target);
    if (pool > 0 && otherGoals.length > 0) {
        const allocation = Math.min(pool, otherGoals.reduce((s, g) => s + (g.target - g.saved), 0));
        if (allocation > 1) {
            recs.push({ title: "Fund Life & Comfort", amount: Math.floor(allocation), reason: "It's important to build the life you want while being responsible. Allocate the rest to your medium and low-priority goals." });
            pool -= Math.floor(allocation);
        }
    }

    // Principle 4: Deep Safety (If everything else is mostly handled)
    if (pool > 0 && bufferMonths < maxDisplay) {
        recs.push({ title: "Expand The Moat", amount: pool, reason: "Your goals are strongly funded. Reinforce your long-term security by pumping the rest into your Safety Buffer ceiling." });
        pool = 0;
    } else if (pool > 0) {
        recs.push({ title: "Unbound Wealth", amount: pool, reason: "You have excess cash with no immediate targets. Consider investing in index funds or creating new ambitious goals!" });
    }

    return recs;
}
