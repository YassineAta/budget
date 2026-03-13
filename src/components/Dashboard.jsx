import { useState } from 'react';
import { useStore, monthlyEssentials, calcTopUpAmount } from '../store';
import ProgressBar from './ProgressBar';
import GoalCard from './GoalCard';

export default function Dashboard({ onTabChange }) {
    const { state, dispatch } = useStore();
    const { balance, cash, monthly, goals, safetyMonths, bufferMaxMonths, bufferLeveledUp, monthlyTransferred, settings } = state;
    const cur = settings.currency;

    const [toast, setToast] = useState(null);

    const bufferGoal = goals.find(g => g.isBuffer);
    const totalAllocated = goals.reduce((s, g) => s + g.saved, 0);
    const totalTargets = goals.reduce((s, g) => s + g.target, 0);
    const essentials = monthlyEssentials(state);
    const balancePct = essentials > 0 ? (balance / essentials) * 100 : 0;
    const topUpAmt = calcTopUpAmount(state);

    const topGoals = goals
        .filter(g => !g.isBuffer && g.saved < g.target)
        .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority]))
        .slice(0, 3);
    const readyGoals = goals.filter(g => !g.isBuffer && !g.isRecurring && g.saved >= g.target);

    function handleTopUp() {
        if (topUpAmt > 0) {
            dispatch({ type: 'TOP_UP_BALANCE' });
            setToast(`✅ Transferred ${topUpAmt} ${cur} from Buffer`);
        } else {
            setToast('⚠️ Buffer is empty — add income first');
        }
        setTimeout(() => setToast(null), 3500);
    }

    const maxDisplay = Math.min(bufferMaxMonths || 12, 12);

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
                            Your safety net grew automatically. Next target: {safetyMonths + 1} months × {essentials} {cur} = {(safetyMonths + 1) * essentials} {cur}. Tap to dismiss.
                        </div>
                    </div>
                </div>
            )}

            {/* ── CURRENT BALANCE ─────────────────────────────────────────── */}
            <div className="card" style={balance < 30 ? { borderColor: 'rgba(234,179,8,0.4)' } : {}}>
                <div className="flex-between mb-4">
                    <div className="card-title"><span className="icon">💳</span> Current Balance</div>
                    <button
                        className={`btn btn-sm ${topUpAmt > 0 ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={handleTopUp}
                        style={{ fontSize: '0.68rem' }}
                    >
                        ↑ Top Up from Buffer
                    </button>
                </div>
                <div className="card-value" style={{ color: balance < 30 ? 'var(--yellow)' : 'var(--green)' }}>
                    {balance.toLocaleString()} {cur}
                </div>
                <ProgressBar
                    value={balance}
                    max={essentials}
                    label={`${Math.round(balancePct)}% of month covered`}
                    rightLabel={`Goal: ${essentials} ${cur}`}
                    color={balancePct >= 80 ? 'green' : balancePct >= 40 ? 'yellow' : 'red'}
                />
                {monthly.spent > 0 && (
                    <div className="card-sub mt-8">🛒 Spent this month: <strong>{monthly.spent.toLocaleString()} {cur}</strong></div>
                )}
                {balance < 30 && (
                    <div className="alert alert-warning mt-8" style={{ marginBottom: 0 }}>
                        <span>⚠️</span><span>Balance is low! Top up or log new income.</span>
                    </div>
                )}
                {monthlyTransferred > 0 && (
                    <div className="card-sub mt-4" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.67rem' }}>
                        Buffer → Balance this month: {monthlyTransferred} {cur}
                    </div>
                )}
            </div>

            {/* Free cash alert */}
            {cash > 0 && (
                <div className="alert alert-info mt-12" style={{ cursor: 'pointer' }} onClick={() => onTabChange('income')}>
                    <span>🧠</span>
                    <span>You have <strong>{cash} {cur}</strong> unallocated. <strong>Allocate it →</strong></span>
                </div>
            )}

            {/* ── SAFETY BUFFER (Progressive) ─────────────────────────────── */}
            {bufferGoal && (
                <div className="card mt-12">
                    <div className="flex-between mb-4">
                        <div className="card-title"><span className="icon">🛡️</span> Safety Buffer</div>
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

                    {/* Growth arc — tile grid showing progress through month milestones */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                        {Array.from({ length: maxDisplay }, (_, i) => i + 1).map(m => (
                            <div key={m} title={`${m} month${m > 1 ? 's' : ''}: ${m * essentials} ${cur}`} style={{
                                width: 22, height: 22, borderRadius: 4,
                                fontSize: '0.55rem', fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: m < safetyMonths ? 'var(--green)' : m === safetyMonths ? 'var(--blue)' : 'rgba(255,255,255,0.07)',
                                color: m <= safetyMonths ? '#fff' : 'rgba(255,255,255,0.25)',
                                border: m === safetyMonths ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
                                transition: 'all 0.4s',
                            }}>{m}</div>
                        ))}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                        Current: <strong style={{ color: 'var(--blue)' }}>{safetyMonths}mo</strong> ({safetyMonths * essentials} {cur})
                        {safetyMonths < (bufferMaxMonths || 12) && (
                            <> → Next: <strong style={{ color: 'rgba(255,255,255,0.55)' }}>{safetyMonths + 1}mo</strong> ({(safetyMonths + 1) * essentials} {cur})</>
                        )}
                    </div>

                    <ProgressBar
                        value={bufferGoal.saved}
                        max={bufferGoal.target}
                        label={`${bufferGoal.saved.toLocaleString()} ${cur}`}
                        rightLabel={`Target: ${bufferGoal.target.toLocaleString()} ${cur}`}
                        color={bufferGoal.saved >= bufferGoal.target ? 'green' : bufferGoal.saved / bufferGoal.target > 0.5 ? 'yellow' : 'red'}
                    />
                    <div className="card-sub mt-8">
                        {bufferGoal.target > 0 && bufferGoal.saved >= bufferGoal.target
                            ? <span className="text-green">✅ {safetyMonths}-month buffer full — expanding to {safetyMonths + 1} months next income</span>
                            : <span style={{ color: 'var(--red)' }}>⚠️ {(bufferGoal.target - bufferGoal.saved).toLocaleString()} {cur} needed to reach {safetyMonths}-month target</span>
                        }
                    </div>
                </div>
            )}

            {/* ── MONTHLY ESSENTIALS ──────────────────────────────────────── */}
            <div className="card mt-12">
                <div className="card-title"><span className="icon">🛒</span> Monthly Essentials</div>
                <div className="mini-grid">
                    <div className="mini-card"><div className="label">Survival</div><div className="value">{monthly.budget} {cur}</div></div>
                    <div className="mini-card"><div className="label">Recurring</div><div className="value">{essentials - monthly.budget} {cur}</div></div>
                    <div className="mini-card"><div className="label">Total</div><div className="value text-blue">{essentials} {cur}</div></div>
                </div>
            </div>

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

            {/* ── SAVING HEALTH ───────────────────────────────────────────── */}
            {totalTargets > 0 && (
                <div className="card mt-24" style={{ background: 'rgba(59,130,246,0.05)', border: '1px dashed rgba(59,130,246,0.3)' }}>
                    <div className="card-title" style={{ fontSize: '0.8rem', opacity: 0.7 }}>Overall Goal Progress</div>
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
