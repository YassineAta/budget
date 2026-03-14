export function calculateProgress(saved, target) {
    const remaining = Math.max(0, target - saved);
    const pct = target > 0 ? Math.round((saved / target) * 100) : 0;
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
