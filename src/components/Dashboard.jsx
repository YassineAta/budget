import { useState } from 'react';
import { useStore, monthlyEssentials } from '../store';
import ProgressBar from './ProgressBar';
import GoalCard from './GoalCard';

export default function Dashboard({ onTabChange }) {
    const { state, dispatch } = useStore();
    const { cash, monthly, goals, safetyMonths, bufferMaxMonths, bufferLeveledUp, settings } = state;
    const cur = settings.currency;

    const [toast, setToast] = useState(null);

    const bufferGoal = goals.find(g => g.isBuffer);
    const totalAllocated = goals.reduce((s, g) => s + g.saved, 0);
    const totalTargets = goals.reduce((s, g) => s + g.target, 0);
    const essentials = monthlyEssentials(state);

    // Logic for "Available for Spend"
    // The buffer holds your survival money. 
    // Available = (Saved in buffer) - (Needs ALREADY SPENT this month)
    // Actually, it's simpler: you spend FROM the buffer. 
    // The "Needs" is just a Target for the CURRENT month.
    const available = bufferGoal ? bufferGoal.saved : 0;
    const spentThisMonth = monthly.spent || 0;
    const remainingBudget = Math.min(available, Math.max(0, monthly.budget - spentThisMonth));

    const topGoals = goals
        .filter(g => !g.isBuffer && g.saved < g.target)
        .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority]))
        .slice(0, 3);
    const readyGoals = goals.filter(g => !g.isBuffer && !g.isRecurring && g.saved >= g.target);

    const maxDisplay = bufferMaxMonths || 12;

    return (
        <div>
            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
                    background: '#1e293b', border: '1px solid var(--green)',
                    borderRadius: 12, padding: '10px 20px', zIndex: 1000,
                    fontSize: '0.82rem', color: 'var(--green)', boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
                    whiteSpace: 'nowrap',
                }}>{toast}</div>
            )}

            {/* ── LEVEL-UP BANNER ─────────────────────────────────────────── */}
            {bufferLeveledUp && (
                <div
                    className="alert alert-success"
                    style={{ cursor: 'pointer', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.5)', marginBottom: 12 }}
                    onClick={() => dispatch({ type: 'DISMISS_BUFFER_LEVELUP' })}
                >
                    <span style={{ fontSize: '1.5rem' }}>🏆</span>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800 }}>Buffer leveled up to {safetyMonths} months!</div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.75 }}>
                            Your safety net grew automatically. Next target: {safetyMonths + 1} months. Tap to dismiss.
                        </div>
                    </div>
                </div>
            )}

            {/* ── SAFETY BUFFER (The Pot) ─────────────────────────────────── */}
            <div className="card">
                <div className="flex-between mb-4">
                    <div className="card-title"><span className="icon">🛡️</span> Safety Buffer & Pot</div>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        Ceiling:
                        <select
                            value={bufferMaxMonths || 12}
                            onChange={e => dispatch({ type: 'SET_BUFFER_MAX', value: parseInt(e.target.value) })}
                            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', cursor: 'pointer' }}
                        >
                            {[6, 9, 12, 18, 24].map(m => <option key={m} value={m}>{m}mo</option>)}
                        </select>
                    </div>
                </div>

                <div className="card-value" style={{ color: available < 50 ? 'var(--red)' : available < 150 ? 'var(--yellow)' : 'var(--green)' }}>
                    {available.toLocaleString()} {cur}
                </div>

                <div style={{ marginBottom: 15 }}>
                    <div className="flex-between" style={{ fontSize: '0.72rem', opacity: 0.6, marginBottom: 4 }}>
                        <span>Survival Budget Left</span>
                        <span>{remainingBudget} / {monthly.budget} {cur}</span>
                    </div>
                    <ProgressBar
                        value={remainingBudget}
                        max={monthly.budget}
                        color={remainingBudget < 20 ? 'red' : remainingBudget < 100 ? 'yellow' : 'green'}
                    />
                </div>

                {/* Growth arc — tiles reflect ACTUAL funded months, not just milestone */}
                {(() => {
                    const fundedMonths = essentials > 0 ? Math.floor((bufferGoal?.saved || 0) / essentials) : 0;
                    return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                            {Array.from({ length: maxDisplay }, (_, i) => i + 1).map(m => {
                                const isActuallyFunded = m <= fundedMonths;
                                const isCurrentGoal = m === safetyMonths && !isActuallyFunded;
                                return (
                                    <div key={m} title={`${m}mo: ${m * essentials} ${cur}${isActuallyFunded ? ' ✅ funded' : ''}`} style={{
                                        width: 22, height: 22, borderRadius: 4,
                                        fontSize: '0.55rem', fontWeight: 700,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: isActuallyFunded ? 'var(--green)' : isCurrentGoal ? 'var(--blue)' : 'rgba(255,255,255,0.07)',
                                        color: isActuallyFunded || isCurrentGoal ? '#fff' : 'rgba(255,255,255,0.25)',
                                        border: isCurrentGoal ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
                                        transition: 'all 0.4s',
                                    }}>{m}</div>
                                );
                            })}
                        </div>
                    );
                })()}

                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                    Strength: <strong style={{ color: 'var(--blue)' }}>{safetyMonths}mo</strong> ({safetyMonths * essentials} {cur})
                </div>

                <ProgressBar
                    value={bufferGoal?.saved || 0}
                    max={maxDisplay * essentials || 1}
                    label="Long-term Safety Progress"
                    color={available >= (maxDisplay * essentials) ? 'green' : available / (maxDisplay * essentials) > 0.5 ? 'yellow' : 'blue'}
                />
            </div>

            {/* Free cash alert */}
            {cash > 0 && (
                <div className="alert alert-info mt-12" style={{ cursor: 'pointer' }} onClick={() => onTabChange('income')}>
                    <span>🧠</span>
                    <span>You have <strong>{cash} {cur}</strong> unallocated. <strong>Allocate it →</strong></span>
                </div>
            )}

            {/* ── READY TO BUY ─────────────────────────────────────────────── */}
            {readyGoals.length > 0 && (
                <>
                    <div className="section-title">🎁 Ready to Buy</div>
                    {readyGoals.map(goal => <GoalCard key={goal.id} goal={goal} compact />)}
                </>
            )}

            {/* ── NEXT PRIORITIES ─────────────────────────────────────────── */}
            {topGoals.length > 0 && (
                <>
                    <div className="section-title">🎯 Next Priorities</div>
                    {topGoals.map(goal => <GoalCard key={goal.id} goal={goal} compact />)}
                </>
            )}

            {/* ── MONTHLY ESSENTIALS ──────────────────────────────────────── */}
            <div className="card mt-12">
                <div className="card-title"><span className="icon">🛒</span> Monthly Target</div>
                <div className="mini-grid">
                    <div className="mini-card"><div className="label">Survival</div><div className="value">{monthly.budget} {cur}</div></div>
                    <div className="mini-card"><div className="label">Recurring</div><div className="value">{essentials - monthly.budget} {cur}</div></div>
                    <div className="mini-card"><div className="label">Full Month</div><div className="value text-blue">{essentials} {cur}</div></div>
                </div>
            </div>

            {/* ── OVERALL SAVING ───────────────────────────────────────────── */}
            {totalTargets > 0 && (
                <div className="card mt-24" style={{ background: 'rgba(59,130,246,0.05)', border: '1px dashed rgba(59,130,246,0.3)' }}>
                    <div className="card-title" style={{ fontSize: '0.8rem', opacity: 0.7 }}>Net Goal Progress</div>
                    <ProgressBar
                        value={totalAllocated}
                        max={totalTargets}
                        label={`${Math.round((totalAllocated / totalTargets) * 100)}% funded`}
                        color="blue"
                    />
                </div>
            )}
        </div>
    );
}
