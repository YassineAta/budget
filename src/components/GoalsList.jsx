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
    const cur = settings.currency;

    const [sort, setSort] = useState('priority');
    const [showAdd, setShowAdd] = useState(false);
    const [showMove, setShowMove] = useState(false);

    // Add form state
    const [name, setName] = useState('');
    const [target, setTarget] = useState('');
    const [priority, setPriority] = useState('Medium');
    const [category, setCategory] = useState('Comfort');
    const [targetDate, setTargetDate] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [monthlyCost, setMonthlyCost] = useState('');

    // Move form state
    const [moveFromId, setMoveFromId] = useState('');
    const [moveToId, setMoveToId] = useState('');
    const [moveAmt, setMoveAmt] = useState('');

    // Sort goals
    const sorted = useMemo(() => {
        console.time('GoalsList:sort');
        const res = [...goals].sort((a, b) => {
            // Buffer always first
            if (a.isBuffer) return -1;
            if (b.isBuffer) return 1;

            if (sort === 'priority') {
                return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
            }
            if (sort === 'funded') {
                const pctA = a.target > 0 ? a.saved / a.target : 0;
                const pctB = b.target > 0 ? b.saved / b.target : 0;
                return pctB - pctA; // highest funded first
            }
            if (sort === 'deadline') {
                if (!a.targetDate && !b.targetDate) return 0;
                if (!a.targetDate) return 1;
                if (!b.targetDate) return -1;
                return a.targetDate.localeCompare(b.targetDate);
            }
            return 0;
        });
        console.timeEnd('GoalsList:sort');
        return res;
    }, [goals, sort]);

    const totalAllocated = useMemo(() => goals.reduce((s, g) => s + g.saved, 0), [goals]);

    function handleAdd(e) {
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
                isRecurring,
                monthlyCost: isRecurring ? parseFloat(monthlyCost) || parseFloat(target) : 0,
            },
        });
        setName(''); setTarget(''); setPriority('Medium'); setCategory('Comfort');
        setTargetDate(''); setIsRecurring(false); setMonthlyCost('');
        setShowAdd(false);
    }

    function handleMove(e) {
        e.preventDefault();
        const amt = parseFloat(moveAmt);
        if (!moveFromId || !moveToId || moveFromId === moveToId || !amt || amt <= 0) return;
        dispatch({ type: 'MOVE_FUNDS', fromId: moveFromId, toId: moveToId, amount: amt });
        setMoveAmt('');
        setShowMove(false);
    }

    const goalsWithSaved = useMemo(() => goals.filter(g => g.saved > 0), [goals]);

    console.log('🎯 Render: GoalsList');

    return (
        <div>
            {/* Header */}
            <div className="flex-between mb-12">
                <div className="section-title" style={{ margin: 0 }}>🎯 Goals</div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => { setShowMove(!showMove); setShowAdd(false); }}>
                        ↔️ Move
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={() => { setShowAdd(!showAdd); setShowMove(false); }}>
                        {showAdd ? '✕' : '+ New'}
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

            {/* Move Money Modal */}
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

            {/* Add Goal Form */}
            {showAdd && (
                <div className="card">
                    <div className="card-title">Create New Goal</div>
                    <form onSubmit={handleAdd}>
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
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: '0.82rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
                            🔄 Recurring (monthly payment)
                        </label>
                        {isRecurring && (
                            <div className="input-row mt-8">
                                <input type="number" placeholder="Monthly cost" value={monthlyCost} onChange={e => setMonthlyCost(e.target.value)} min="0" />
                            </div>
                        )}
                        <button className="btn btn-primary mt-12" type="submit" style={{ width: '100%' }}>Create Goal</button>
                    </form>
                </div>
            )}

            {/* Sort Controls */}
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

            {/* Goal Cards */}
            <div className="goals-grid">
                {sorted.map(goal => (
                    <GoalCard key={goal.id} goal={goal} />
                ))}
            </div>

            {goals.length === 0 && (
                <div className="card">
                    <div className="empty-state">
                        <div className="icon">🎯</div>
                        <div>No goals yet. Create your first one!</div>
                    </div>
                </div>
            )}
        </div>
    );
}
