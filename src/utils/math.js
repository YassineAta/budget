export function calculateProgress(saved, target) {
    const remaining = Math.max(0, target - saved);
    // Cap at 100%: an over-funded goal (e.g. target lowered below saved) must
    // never display a mathematically impossible >100% progress.
    const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
    const isFunded = remaining <= 0;
    
    let barColor = 'red';
    let pctColor = 'var(--red)';
    
    if (isFunded) {
        barColor = 'green';
        pctColor = 'var(--green)';
    } else if (pct >= 50) {
        barColor = 'yellow';
        pctColor = 'var(--yellow)';
    }
    
    return {
        remaining,
        pct,
        isFunded,
        barColor,
        pctColor
    };
}
