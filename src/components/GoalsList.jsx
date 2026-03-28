import { useState, useMemo } from 'react';
import { useStore } from '../store';
import GoalCard from './GoalCard';

const SORT_OPTIONS = [
    { value: 'priority', label: '🔥 Priority' },
    { value: 'funded', label: '📊 % Funded' },
    { value: 'deadline', label: '📅 Deadline' },
];

const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };

export default function GoalsList() {
    const { state, dispatch } = useStore();
    const { goals, cash, settings } = state;
    const recurringExpenses = state.recurringExpenses || [];
    const cur = settings.currency;

    const [sort, setSort] = useState('priority');
    const [showAddSaving, setShowAddSaving] = useState(false);
    const [showAddRecurring, setShowAddRecurring] = useState(false);
    const [showMove, setShowMove] = useState(false);

    // ── Saving goal form state ─────────────────────────────────────────────
    const [name, setName] = useState('');
    const [target, setTarget] = useState('');
    const [priority, setPriority] = useState('Medium');
    const [category, setCategory] = useState('Comfort');
    const [targetDate, setTargetDate] = useState('');
    const [goalType, setGoalType] = useState('saving');

    // ── Recurring expense form state ───────────────────────────────────────
    const [recName, setRecName] = useState('');
    const [recAmount, setRecAmount] = useState('');
    const [recPeriod, setRecPeriod] = useState('monthly');
    const [recCutDay, setRecCutDay] = useState(1);

    // ── Move form state ────────────────────────────────────────────────────
    const [moveFromId, setMoveFromId] = useState('');
    const [moveToId, setMoveToId] = useState('');
    const [moveAmt, setMoveAmt] = useState('');

    // ── Sections ───────────────────────────────────────────────────────────
    const bufferGoal = goals.find(g => g.isBuffer);
    const savingGoals = useMemo(() => {
        const list = goals.filter(g => !g.isBuffer && g.type !== 'wishlist');
        return [...list].sort((a, b) => {
            if (sort === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
            if (sort === 'funded') {
                const pA = a.target > 0 ? a.saved / a.target : 0;
                const pB = b.target > 0 ? b.saved / b.target : 0;
                return pB - pA;
            }
            if (sort === 'deadline') {
                if (!a.targetDate && !b.targetDate) return 0;
                if (!a.targetDate) return 1;
                if (!b.targetDate) return -1;
                return a.targetDate.localeCompare(b.targetDate);
            }
            return 0;
        });
    }, [goals, sort]);
    const wishlistGoals = useMemo(() => goals.filter(g => g.type === 'wishlist'), [goals]);
    const goalsWithSaved = useMemo(() => goals.filter(g => g.saved > 0), [goals]);

    const totalAllocated = useMemo(() => goals.reduce((s, g) => s + g.saved, 0), [goals]);

    // ── Handlers ───────────────────────────────────────────────────────────
    function handleAddSaving(e) {
        e.preventDefault();
        if (!name.trim() || !target) return;
        dispatch({
            type: 'ADD_GOAL',
            goal: {
                name: name.trim(),
                target: parseFloat(target),
                priority,
                category,
                targetDate,
                type: goalType,
            },
        });
        setName(''); setTarget(''); setPriority('Medium'); setCategory('Comfort');
        setTargetDate(''); setGoalType('saving');
        setShowAddSaving(false);
    }

    function handleAddRecurring(e) {
        e.preventDefault();
        const amt = parseFloat(recAmount);
        if (!recName.trim() || !amt || amt <= 0) return;
        dispatch({
            type: 'ADD_RECURRING_EXPENSE',
            expense: {
                name: recName.trim(),
                amount: amt,
                period: recPeriod,
                cut_day: recPeriod === 'monthly' ? Math.min(Math.max(1, parseInt(recCutDay) || 1), 28) : 1,
            },
        });
        setRecName(''); setRecAmount(''); setRecPeriod('monthly'); setRecCutDay(1);
        setShowAddRecurring(false);
    }

    function handleMove(e) {
        e.preventDefault();
        const amt = parseFloat(moveAmt);
        if (!moveFromId || !moveToId || moveFromId === moveToId || !amt || amt <= 0) return;
        dispatch({ type: 'MOVE_FUNDS', fromId: moveFromId, toId: moveToId, amount: amt });
        setMoveAmt('');
        setShowMove(false);
    }


    return (
        <div>
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex-between mb-12">
                <div className="section-title" style={{ margin: 0 }}>🎯 Goals</div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => { setShowMove(!showMove); setShowAddSaving(false); setShowAddRecurring(false); }}>
                        ↔️ Move
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={() => { setShowAddSaving(!showAddSaving); setShowMove(false); setShowAddRecurring(false); }}>
                        {showAddSaving ? '✕' : '+ Goal'}
                    </button>
                </div>
            </div>

            {/* Summary */}
            <div className="mini-grid mb-12">
                <div className="mini-card">
                    <div className="label">Cash</div>
                    <div className="value text-green" style={{ fontSize: '1.1rem' }}>{cash.toLocaleString()} {cur}</div>
                </div>
                <div className="mini-card">
                    <div className="label">Allocated</div>
                    <div className="value text-blue" style={{ fontSize: '1.1rem' }}>{totalAllocated.toLocaleString()} {cur}</div>
                </div>
            </div>

            {/* ── Move Money Modal ─────────────────────────────────────────── */}
            {showMove && (
                <div className="card" style={{ borderColor: 'rgba(59,130,246,0.3)' }}>
                    <div className="card-title"><span className="icon">↔️</span> Move Money Between Goals</div>
                    <form onSubmit={handleMove}>
                        <div style={{ marginBottom: 8 }}>
                            <label className="text-muted" style={{ fontSize: '0.72rem', display: 'block', marginBottom: 4 }}>From</label>
                            <select value={moveFromId} onChange={e => setMoveFromId(e.target.value)} style={{ width: '100%' }}>
                                <option value="">Select source goal...</option>
                                {goalsWithSaved.map(g => (
                                    <option key={g.id} value={g.id}>{g.name} ({g.saved.toLocaleString()} {cur} saved)</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                            <label className="text-muted" style={{ fontSize: '0.72rem', display: 'block', marginBottom: 4 }}>To</label>
                            <select value={moveToId} onChange={e => setMoveToId(e.target.value)} style={{ width: '100%' }}>
                                <option value="">Select target goal...</option>
                                {goals.filter(g => g.saved < g.target && g.id !== moveFromId).map(g => (
                                    <option key={g.id} value={g.id}>{g.name} ({(g.target - g.saved).toLocaleString()} {cur} left)</option>
                                ))}
                            </select>
                        </div>
                        <div className="input-row">
                            <input type="number" placeholder="Amount" value={moveAmt} onChange={e => setMoveAmt(e.target.value)} min="0" />
                            <button className="btn btn-blue" type="submit">Move</button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── Add Saving/Wishlist Goal Form ───────────────────────────── */}
            {showAddSaving && (
                <div className="card">
                    <div className="card-title">Create New Goal</div>
                    <form onSubmit={handleAddSaving}>
                        <input type="text" placeholder="Goal name" value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
                        <div className="input-row">
                            <input type="number" placeholder="Target price" value={target} onChange={e => setTarget(e.target.value)} min="0" />
                            <select value={priority} onChange={e => setPriority(e.target.value)}>
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                            </select>
                        </div>
                        <div className="input-row">
                            <select value={category} onChange={e => setCategory(e.target.value)}>
                                <option value="Essential">Essential</option>
                                <option value="Productivity">Productivity</option>
                                <option value="Comfort">Comfort</option>
                                <option value="Education">Education</option>
                                <option value="Luxury">Luxury</option>
                            </select>
                            <input type="month" value={targetDate} onChange={e => setTargetDate(e.target.value)} placeholder="Target date" />
                        </div>
                        {/* Type selector: saving goals affect balance; wishlist items do not */}
                        <div className="input-row mt-8">
                            <select value={goalType} onChange={e => setGoalType(e.target.value)} style={{ flex: 1 }}>
                                <option value="saving">💰 Saving Goal</option>
                                <option value="wishlist">💭 Wishlist (no balance effect)</option>
                            </select>
                        </div>
                        <button className="btn btn-primary mt-12" type="submit" style={{ width: '100%' }}>Create Goal</button>
                    </form>
                </div>
            )}

            {/* ── Sort Controls (for saving goals) ────────────────────────── */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {SORT_OPTIONS.map(opt => (
                    <button
                        key={opt.value}
                        className={`btn btn-sm ${sort === opt.value ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setSort(opt.value)}
                        style={{ fontSize: '0.7rem' }}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* ── SECTION: Safety Buffer ───────────────────────────────────── */}
            {bufferGoal && (
                <>
                    <div className="section-title" style={{ fontSize: '0.75rem', opacity: 0.6 }}>🛡️ Safety Buffer</div>
                    <div className="goals-grid">
                        <GoalCard key={bufferGoal.id} goal={bufferGoal} />
                    </div>
                </>
            )}

            {/* ── SECTION: Recurring Expenses ─────────────────────────────── */}
            <div className="flex-between" style={{ marginTop: 16, marginBottom: 6 }}>
                <div className="section-title" style={{ fontSize: '0.75rem', opacity: 0.6, margin: 0 }}>🔄 Recurring Expenses</div>
                <button
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: '0.7rem' }}
                    onClick={() => { setShowAddRecurring(!showAddRecurring); setShowAddSaving(false); }}
                >
                    {showAddRecurring ? '✕' : '+ Add'}
                </button>
            </div>

            {showAddRecurring && (
                <div className="card" style={{ marginBottom: 8 }}>
                    <div className="card-title" style={{ fontSize: '0.82rem' }}>New Recurring Expense</div>
                    <form onSubmit={handleAddRecurring}>
                        <input
                            type="text"
                            placeholder="Name (e.g. Netflix)"
                            value={recName}
                            onChange={e => setRecName(e.target.value)}
                            style={{ width: '100%', marginBottom: 8 }}
                        />
                        <div className="input-row">
                            <input
                                type="number"
                                placeholder="Amount"
                                value={recAmount}
                                onChange={e => setRecAmount(e.target.value)}
                                min="0"
                            />
                            <select value={recPeriod} onChange={e => setRecPeriod(e.target.value)}>
                                <option value="monthly">Monthly</option>
                                <option value="weekly">Weekly</option>
                            </select>
                        </div>
                        {recPeriod === 'monthly' && (
                            <div className="input-row mt-8" style={{ alignItems: 'center' }}>
                                <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                                    Cut on day:
                                </label>
                                <input
                                    type="number"
                                    min="1" max="28"
                                    value={recCutDay}
                                    onChange={e => setRecCutDay(e.target.value)}
                                    style={{ maxWidth: 70 }}
                                    placeholder="1–28"
                                />
                                <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)' }}>of the month</span>
                            </div>
                        )}
                        {recPeriod === 'weekly' && (
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                                Deducted every 7 days. Equivalent to ~{(parseFloat(recAmount) * (365.25 / 12 / 7) || 0).toFixed(2)} {cur}/month in buffer calculations.
                            </div>
                        )}
                        <button className="btn btn-primary mt-12" type="submit" style={{ width: '100%' }}>Add Recurring</button>
                    </form>
                </div>
            )}

            {recurringExpenses.length === 0 ? (
                <div className="card" style={{ padding: '10px 14px' }}>
                    <div className="empty-state" style={{ fontSize: '0.78rem' }}>No recurring expenses yet.</div>
                </div>
            ) : (
                <div className="card" style={{ padding: '6px 0' }}>
                    {recurringExpenses.map(exp => (
                        <div key={exp.id} className="list-item" style={{ padding: '8px 14px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
                                <input
                                    type="checkbox"
                                    checked={exp.active}
                                    onChange={() => dispatch({ type: 'TOGGLE_RECURRING', id: exp.id })}
                                />
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.85rem', textDecoration: exp.active ? 'none' : 'line-through', opacity: exp.active ? 1 : 0.5 }}>
                                        {exp.name}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)' }}>
                                        {exp.amount} {cur} / {exp.period}
                                        {exp.period === 'monthly' && exp.cut_day && (
                                            <span style={{ marginLeft: 6, opacity: 0.7 }}>· day {exp.cut_day}</span>
                                        )}
                                    </div>
                                </div>
                            </label>
                            <button
                                className="btn btn-sm btn-ghost"
                                style={{ color: 'var(--red)', padding: '2px 6px' }}
                                onClick={() => dispatch({ type: 'DELETE_RECURRING_EXPENSE', id: exp.id })}
                                aria-label={`Delete ${exp.name}`}
                            >✕</button>
                        </div>
                    ))}
                </div>
            )}

            {/* ── SECTION: Savings Goals ───────────────────────────────────── */}
            <div className="section-title" style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: 16 }}>💰 Savings Goals</div>
            {savingGoals.length === 0 ? (
                <div className="card">
                    <div className="empty-state">No saving goals yet. Create one above!</div>
                </div>
            ) : (
                <div className="goals-grid">
                    {savingGoals.map(goal => <GoalCard key={goal.id} goal={goal} />)}
                </div>
            )}

            {/* ── SECTION: Wishlist ────────────────────────────────────────── */}
            {wishlistGoals.length > 0 && (
                <>
                    <div className="section-title" style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: 16 }}>
                        💭 Wishlist <span style={{ fontWeight: 400 }}>(no balance effect)</span>
                    </div>
                    <div className="goals-grid">
                        {wishlistGoals.map(goal => (
                            <div key={goal.id} style={{ position: 'relative' }}>
                                <GoalCard goal={goal} />
                                <button
                                    className="btn btn-sm btn-outline"
                                    style={{ width: '100%', marginTop: 4, fontSize: '0.72rem' }}
                                    onClick={() => dispatch({ type: 'EDIT_GOAL', id: goal.id, updates: { type: 'saving' } })}
                                >
                                    Convert to Saving Goal →
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
