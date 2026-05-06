import { useState } from 'react';
import { useStore, monthlyEssentials } from '../store';
import ProgressBar from './ProgressBar';
import GoalCard from './GoalCard';
import { getRecommendation } from '../utils/financeAI';
import { simulateRunout, projectBalance, normalizeToMonthly } from '../utils/cashflow';

// ── Runout helper ─────────────────────────────────────────────────────────────
function RunoutBadge({ state, cur }) {
    const buffer = state.goals?.find(g => g.isBuffer);
    if (!buffer || buffer.saved <= 0) {
        return (
            <div style={{ fontSize: '0.72rem', color: 'var(--red)', fontWeight: 700, marginBottom: 8 }}>
                ⚠️ Buffer depleted
            </div>
        );
    }

    const runout = simulateRunout(state);
    const now = new Date();

    if (!runout) {
        const p12 = projectBalance(state, 365);
        return (
            <div style={{ fontSize: '0.72rem', color: 'var(--green)', marginBottom: 8 }}>
                ✅ Runway: &gt;1 year &nbsp;·&nbsp; In 12mo: <strong>{p12.toLocaleString()} {cur}</strong>
            </div>
        );
    }

    const daysLeft = Math.ceil((runout - now) / 86_400_000);
    const dateStr = runout.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const color = daysLeft < 30 ? 'var(--red)' : daysLeft < 90 ? 'var(--yellow)' : 'var(--blue)';
    const icon = daysLeft < 30 ? '🚨' : daysLeft < 90 ? '⚠️' : '📅';

    return (
        <div style={{ fontSize: '0.72rem', color, marginBottom: 8, fontWeight: daysLeft < 90 ? 700 : 400 }}>
            {icon} Runs out in ~{daysLeft}d &nbsp;·&nbsp; <strong>{dateStr}</strong>
            <span style={{ fontSize: '0.65rem', opacity: 0.6 }}> (incl. monthly budget)</span>
        </div>
    );
}

export default function Dashboard({ onTabChange }) {
    const { state, dispatch } = useStore();
    const { cash, monthly, goals, safetyMonths, settings } = state;
    const cur = settings.currency;

    const [showRec, setShowRec] = useState(false);

    const bufferGoal = goals.find(g => g.isBuffer);
    const recurringExpenses = state.recurringExpenses || [];
    const totalAllocated = goals.reduce((s, g) => s + g.saved, 0);
    const totalTargets = goals.reduce((s, g) => s + g.target, 0);
    const essentials = monthlyEssentials(state);

    const available = bufferGoal ? bufferGoal.saved : 0;
    const spentThisMonth = monthly.spent || 0;
    const remainingBudget = Math.min(available, Math.max(0, essentials - spentThisMonth));

    const bufferTarget = (safetyMonths || 3) * essentials;
    const fundedMonths = essentials > 0 ? (available / essentials).toFixed(1) : '—';

    // Monthly recurring cost (sum normalised to monthly)
    const monthlyRecurring = recurringExpenses
        .filter(e => e.active)
        .reduce((s, e) => s + normalizeToMonthly(e), 0);

    const topGoals = goals
        .filter(g => !g.isBuffer && g.type !== 'wishlist' && g.saved < g.target)
        .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority]))
        .slice(0, 3);
    const readyGoals = goals.filter(g => !g.isBuffer && g.type !== 'wishlist' && g.saved >= g.target);

    const maxDisplay = 12; // for AI rec only

    return (
        <div>
            {/* ── SAFETY BUFFER ────────────────────────────────────────────── */}
            <div className="card">
                <div className="flex-between mb-4">
                    <div className="card-title"><span className="icon">🛡️</span> Safety Buffer</div>
                    {/* Target months selector — dynamic, no level-up gating */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
                        Target:
                        <button
                            onClick={() => dispatch({ type: 'SET_SAFETY_MONTHS', value: (safetyMonths || 3) - 1 })}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0 2px' }}
                            aria-label="Decrease target months"
                        >−</button>
                        <strong style={{ color: 'var(--blue)', minWidth: 20, textAlign: 'center' }}>{safetyMonths || 3}mo</strong>
                        <button
                            onClick={() => dispatch({ type: 'SET_SAFETY_MONTHS', value: (safetyMonths || 3) + 1 })}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0 2px' }}
                            aria-label="Increase target months"
                        >+</button>
                    </div>
                </div>

                {/* Balance */}
                <div className="card-value" style={{ color: available < 50 ? 'var(--red)' : available < 150 ? 'var(--yellow)' : 'var(--green)' }}>
                    {available.toLocaleString()} {cur}
                </div>

                {/* Buffer progress toward target */}
                <div style={{ marginBottom: 10 }}>
                    <div className="flex-between" style={{ fontSize: '0.72rem', opacity: 0.6, marginBottom: 4 }}>
                        <span>{fundedMonths} months funded</span>
                        <span>Target: {bufferTarget.toLocaleString()} {cur} ({safetyMonths || 3}mo)</span>
                    </div>
                    <ProgressBar
                        value={available}
                        max={bufferTarget || 1}
                        color={available >= bufferTarget ? 'green' : available / (bufferTarget || 1) > 0.6 ? 'yellow' : 'blue'}
                    />
                </div>

                {/* Monthly budget remaining */}
                <div style={{ marginBottom: 10 }}>
                    <div className="flex-between" style={{ fontSize: '0.72rem', opacity: 0.6, marginBottom: 4 }}>
                        <span>Monthly budget left</span>
                        <span>{remainingBudget} / {essentials} {cur}</span>
                    </div>
                    <ProgressBar
                        value={remainingBudget}
                        max={essentials || 1}
                        color={remainingBudget < 20 ? 'red' : remainingBudget < 100 ? 'yellow' : 'green'}
                    />
                </div>

                {/* Runout simulation */}
                <RunoutBadge state={state} cur={cur} />
            </div>

            {/* Free cash alert */}
            {cash > 0 && (
                <div className="mt-12">
                    <div style={{ display: 'flex', gap: 8 }}>
                        <div className="alert alert-info" style={{ cursor: 'pointer', flex: 1, margin: 0 }} onClick={() => onTabChange('income')}>
                            <span>🧠</span>
                            <span>You have <strong>{cash.toLocaleString()} {cur}</strong> unallocated. <strong>Allocate it →</strong></span>
                        </div>
                        <button
                            className="btn"
                            style={{ background: 'var(--blue)', color: 'white', fontWeight: 600, border: 'none', padding: '0 16px', borderRadius: 12, cursor: 'pointer' }}
                            onClick={() => setShowRec(!showRec)}
                        >
                            🤖 AI Rec
                        </button>
                    </div>

                    {showRec && (
                        <div className="card mt-8" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)' }}>
                            <div className="card-title text-blue" style={{ marginBottom: 16 }}>
                                <span className="icon">🤖</span> Smart Allocation Recommendation
                            </div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: 16 }}>
                                Based on standard personal finance principles (Safety First, Debt/Priority Focus, Balanced Wants):
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {getRecommendation(cash, goals, essentials, maxDisplay).map((rec, i) => (
                                    <div key={i} style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
                                        <div className="flex-between mb-4">
                                            <strong style={{ color: '#fff' }}>{rec.title}</strong>
                                            <strong className="text-blue">{rec.amount.toLocaleString()} {cur}</strong>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
                                            {rec.reason}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button className="btn btn-outline mt-16 w-full" onClick={() => onTabChange('income')}>
                                Go to Allocation Wizard →
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── READY TO BUY ─────────────────────────────────────────────── */}
            {readyGoals.length > 0 && (
                <>
                    <div className="section-title">🎁 Ready to Buy</div>
                    <div className="goals-grid">
                        {readyGoals.map(goal => <GoalCard key={goal.id} goal={goal} compact />)}
                    </div>
                </>
            )}

            {/* ── NEXT PRIORITIES ─────────────────────────────────────────── */}
            {topGoals.length > 0 && (
                <>
                    <div className="section-title">🎯 Next Priorities</div>
                    <div className="goals-grid">
                        {topGoals.map(goal => <GoalCard key={goal.id} goal={goal} compact />)}
                    </div>
                </>
            )}

            {/* ── MONTHLY BREAKDOWN ───────────────────────────────────────── */}
            <div className="card mt-12">
                <div className="card-title"><span className="icon">🛒</span> Monthly Breakdown</div>
                <div className="mini-grid">
                    <div className="mini-card"><div className="label">Survival</div><div className="value">{monthly.budget} {cur}</div></div>
                    <div className="mini-card"><div className="label">Recurring</div><div className="value">{Math.round(monthlyRecurring)} {cur}</div></div>
                    <div className="mini-card"><div className="label">Total / mo</div><div className="value text-blue">{Math.round(essentials)} {cur}</div></div>
                </div>
            </div>

            {/* ── OVERALL SAVING ───────────────────────────────────────────── */}
            {totalTargets > 0 && (
                <div className="card mt-24" style={{ background: 'rgba(59,130,246,0.05)', border: '1px dashed rgba(59,130,246,0.3)' }}>
                    <div className="card-title" style={{ fontSize: '0.8rem', opacity: 0.7 }}>Net Goal Progress</div>
                    <div className="flex-between mb-8">
                        <div style={{ fontSize: '0.85rem' }}>Total Put Aside</div>
                        <strong className="text-blue">
                            {Math.max(0, totalAllocated - Math.min(bufferGoal?.saved || 0, Math.max(0, (safetyMonths - 1)) * essentials)).toLocaleString()} {cur}
                        </strong>
                    </div>
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
