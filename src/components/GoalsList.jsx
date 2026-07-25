import { useState, useMemo } from 'react';
import { useStore } from '../store';
import GoalCard from './GoalCard';
import {
    IconTarget, IconArrowsHorizontal, IconPlus, IconX, IconShield,
    IconRepeat, IconHeart, IconFlame, IconChart, IconCalendar,
    IconBanknote, IconArrowRight, IconTrash,
} from './icons';

const SORT_OPTIONS = [
    { value: 'priority', label: 'Priority', Icon: IconFlame },
    { value: 'funded',   label: '% Funded', Icon: IconChart },
    { value: 'deadline', label: 'Deadline', Icon: IconCalendar },
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

    const [name, setName] = useState('');
    const [target, setTarget] = useState('');
    const [priority, setPriority] = useState('Medium');
    const [category, setCategory] = useState('Comfort');
    const [targetDate, setTargetDate] = useState('');
    const [goalType, setGoalType] = useState('saving');
    const [isPriority, setIsPriority] = useState(false);

    const [recName, setRecName] = useState('');
    const [recAmount, setRecAmount] = useState('');
    const [recPeriod, setRecPeriod] = useState('monthly');
    const [recCutDay, setRecCutDay] = useState(1);

    const [moveFromId, setMoveFromId] = useState('');
    const [moveToId, setMoveToId] = useState('');
    const [moveAmt, setMoveAmt] = useState('');

    const bufferGoal = goals.find(g => g.isBuffer);
    const priorityGoals = useMemo(
        () => goals.filter(g => g.isPriority && !g.isBuffer && g.type !== 'wishlist'),
        [goals],
    );
    const savingGoals = useMemo(() => {
        const list = goals.filter(g => !g.isBuffer && !g.isPriority && g.type !== 'wishlist');
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
                isPriority: goalType === 'saving' && isPriority,
            },
        });
        setName(''); setTarget(''); setPriority('Medium'); setCategory('Comfort');
        setTargetDate(''); setGoalType('saving'); setIsPriority(false);
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
            <div className="flex-between mb-4">
                <div className="section-title" style={{ margin: 0 }}><IconTarget /> Goals</div>
                <div className="row-tight">
                    <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => { setShowMove(s => !s); setShowAddSaving(false); setShowAddRecurring(false); }}
                    >
                        <IconArrowsHorizontal /> Move
                    </button>
                    <button
                        className="btn btn-sm btn-primary"
                        onClick={() => { setShowAddSaving(s => !s); setShowMove(false); setShowAddRecurring(false); }}
                    >
                        {showAddSaving ? <><IconX /> Close</> : <><IconPlus /> Goal</>}
                    </button>
                </div>
            </div>

            {/* Summary */}
            <div className="mini-grid two mb-4">
                <div className="mini-card">
                    <div className="label">Cash</div>
                    <div className="value text-green">{cash.toLocaleString()} {cur}</div>
                </div>
                <div className="mini-card">
                    <div className="label">Allocated</div>
                    <div className="value text-blue">{totalAllocated.toLocaleString()} {cur}</div>
                </div>
            </div>

            {/* Move money form */}
            {showMove && (
                <section className="card highlight">
                    <div className="card-title"><IconArrowsHorizontal /> Move Money Between Goals</div>
                    <form onSubmit={handleMove}>
                        <label className="field-label">From</label>
                        <select value={moveFromId} onChange={e => setMoveFromId(e.target.value)} style={{ width: '100%' }}>
                            <option value="">Select source goal…</option>
                            {goalsWithSaved.map(g => (
                                <option key={g.id} value={g.id}>{g.name} ({g.saved.toLocaleString()} {cur} saved)</option>
                            ))}
                        </select>
                        <label className="field-label mt-3">To</label>
                        <select value={moveToId} onChange={e => setMoveToId(e.target.value)} style={{ width: '100%' }}>
                            <option value="">Select target goal…</option>
                            {goals.filter(g => g.saved < g.target && g.id !== moveFromId).map(g => (
                                <option key={g.id} value={g.id}>{g.name} ({(g.target - g.saved).toLocaleString()} {cur} left)</option>
                            ))}
                        </select>
                        <div className="input-row">
                            <input type="number" placeholder="Amount" value={moveAmt} onChange={e => setMoveAmt(e.target.value)} min="0" />
                            <button className="btn btn-blue" type="submit">
                                <IconArrowRight /> Move
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {/* Add saving/wishlist form */}
            {showAddSaving && (
                <section className="card">
                    <div className="card-title"><IconPlus /> Create New Goal</div>
                    <form onSubmit={handleAddSaving}>
                        <input
                            type="text"
                            placeholder="Goal name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            style={{ width: '100%' }}
                            autoFocus
                        />
                        <div className="input-row">
                            <input
                                type="number"
                                placeholder="Target price"
                                value={target}
                                onChange={e => setTarget(e.target.value)}
                                min="0"
                            />
                            <select value={priority} onChange={e => setPriority(e.target.value)} aria-label="Priority">
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                            </select>
                        </div>
                        <div className="input-row">
                            <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Category">
                                <option value="Essential">Essential</option>
                                <option value="Productivity">Productivity</option>
                                <option value="Comfort">Comfort</option>
                                <option value="Education">Education</option>
                                <option value="Luxury">Luxury</option>
                            </select>
                            <input
                                type="month"
                                value={targetDate}
                                onChange={e => setTargetDate(e.target.value)}
                                aria-label="Target date"
                            />
                        </div>
                        <div className="input-row">
                            <select value={goalType} onChange={e => setGoalType(e.target.value)} aria-label="Goal type" style={{ flex: 1 }}>
                                <option value="saving">Saving Goal</option>
                                <option value="wishlist">Wishlist (no balance effect)</option>
                            </select>
                        </div>
                        {goalType === 'saving' && (
                            <label className="row mt-2" style={{ cursor: 'pointer', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                                <input
                                    type="checkbox"
                                    checked={isPriority}
                                    onChange={e => setIsPriority(e.target.checked)}
                                    style={{ marginTop: 3 }}
                                />
                                <span>
                                    <span style={{ fontWeight: 600 }}>⭐ Priority reserve</span>
                                    <span className="text-dim" style={{ display: 'block', fontSize: 'var(--text-xs)' }}>
                                        Funded from its own bucket alongside the buffer, before other goals.
                                    </span>
                                </span>
                            </label>
                        )}
                        <button className="btn btn-primary mt-4 w-full" type="submit">
                            <IconPlus /> Create Goal
                        </button>
                    </form>
                </section>
            )}

            {/* Sort */}
            <div className="cluster mb-4">
                {SORT_OPTIONS.map(opt => {
                    const isActive = sort === opt.value;
                    return (
                        <button
                            key={opt.value}
                            className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setSort(opt.value)}
                            aria-pressed={isActive}
                        >
                            <opt.Icon /> {opt.label}
                        </button>
                    );
                })}
            </div>

            {/* Safety Buffer */}
            {bufferGoal && (
                <>
                    <div className="section-title"><IconShield /> Safety Buffer</div>
                    <div className="goals-grid">
                        <GoalCard key={bufferGoal.id} goal={bufferGoal} />
                    </div>
                </>
            )}

            {/* Recurring */}
            <div className="flex-between" style={{ marginTop: 'var(--space-5)', marginBottom: 'var(--space-2)' }}>
                <div className="section-title" style={{ margin: 0 }}><IconRepeat /> Recurring Expenses</div>
                <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => { setShowAddRecurring(s => !s); setShowAddSaving(false); }}
                >
                    {showAddRecurring ? <><IconX /> Close</> : <><IconPlus /> Add</>}
                </button>
            </div>

            {showAddRecurring && (
                <section className="card mb-3">
                    <div className="card-title"><IconRepeat /> New Recurring Expense</div>
                    <form onSubmit={handleAddRecurring}>
                        <input
                            type="text"
                            placeholder="Name (e.g. Netflix)"
                            value={recName}
                            onChange={e => setRecName(e.target.value)}
                            style={{ width: '100%' }}
                            autoFocus
                        />
                        <div className="input-row">
                            <input
                                type="number"
                                placeholder="Amount"
                                value={recAmount}
                                onChange={e => setRecAmount(e.target.value)}
                                min="0"
                            />
                            <select value={recPeriod} onChange={e => setRecPeriod(e.target.value)} aria-label="Period">
                                <option value="monthly">Monthly</option>
                                <option value="weekly">Weekly</option>
                            </select>
                        </div>
                        {recPeriod === 'monthly' && (
                            <div className="input-row" style={{ alignItems: 'center' }}>
                                <label className="field-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Cut on day</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="28"
                                    value={recCutDay}
                                    onChange={e => setRecCutDay(e.target.value)}
                                    style={{ maxWidth: 80 }}
                                    placeholder="1–28"
                                />
                                <span className="text-dim" style={{ fontSize: 'var(--text-xs)' }}>of the month</span>
                            </div>
                        )}
                        {recPeriod === 'weekly' && (
                            <div className="text-dim mt-1" style={{ fontSize: 'var(--text-xs)' }}>
                                Deducted every 7 days. ≈ {(parseFloat(recAmount) * (365.25 / 12 / 7) || 0).toFixed(2)} {cur}/month equivalent.
                            </div>
                        )}
                        <button className="btn btn-primary mt-4 w-full" type="submit">
                            <IconPlus /> Add Recurring
                        </button>
                    </form>
                </section>
            )}

            {recurringExpenses.length === 0 ? (
                <div className="card subtle">
                    <div className="empty-state">No recurring expenses yet.</div>
                </div>
            ) : (
                <div className="card subtle" style={{ padding: 'var(--space-2) var(--space-3)' }}>
                    {recurringExpenses.map(exp => (
                        <div key={exp.id} className="list-item">
                            <label className="row flex-1" style={{ cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={exp.active}
                                    onChange={() => dispatch({ type: 'TOGGLE_RECURRING', id: exp.id })}
                                    aria-label={`Toggle ${exp.name}`}
                                />
                                <div>
                                    <div
                                        className="list-item-name"
                                        style={{
                                            textDecoration: exp.active ? 'none' : 'line-through',
                                            opacity: exp.active ? 1 : 0.5,
                                        }}
                                    >
                                        {exp.name}
                                    </div>
                                    <div className="list-item-meta">
                                        <span className="mono">{exp.amount} {cur}</span>
                                        <span>·</span>
                                        <span>{exp.period}</span>
                                        {exp.period === 'monthly' && exp.cut_day && (
                                            <>
                                                <span>·</span>
                                                <span>day {exp.cut_day}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </label>
                            <button
                                className="btn btn-sm btn-ghost btn-icon"
                                style={{ color: 'var(--red)' }}
                                onClick={() => dispatch({ type: 'DELETE_RECURRING_EXPENSE', id: exp.id })}
                                aria-label={`Delete ${exp.name}`}
                            >
                                <IconTrash />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Savings Goals */}
            <div className="section-title"><IconBanknote /> Savings Goals</div>
            {savingGoals.length === 0 ? (
                <div className="card subtle">
                    <div className="empty-state">No saving goals yet. Create one above.</div>
                </div>
            ) : (
                <div className="goals-grid">
                    {savingGoals.map(goal => <GoalCard key={goal.id} goal={goal} />)}
                </div>
            )}

            {/* Wishlist */}
            {wishlistGoals.length > 0 && (
                <>
                    <div className="section-title">
                        <IconHeart /> Wishlist <span className="text-dim" style={{ fontWeight: 400 }}>(no balance effect)</span>
                    </div>
                    <div className="goals-grid">
                        {wishlistGoals.map(goal => (
                            <div key={goal.id}>
                                <GoalCard goal={goal} />
                                <button
                                    className="btn btn-sm btn-outline w-full mt-1"
                                    onClick={() => dispatch({ type: 'EDIT_GOAL', id: goal.id, updates: { type: 'saving' } })}
                                >
                                    Convert to Saving Goal <IconArrowRight />
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
