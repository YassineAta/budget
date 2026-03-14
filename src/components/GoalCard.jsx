import { useState } from 'react';
import { useStore, getMonthlySaving } from '../store';
import ProgressBar from './ProgressBar';

export default function GoalCard({ goal, compact = false }) {
    const { state, dispatch } = useStore();
    const { cash, balance, settings } = state;
    const cur = settings.currency;

    const [fundAmt, setFundAmt] = useState('');
    const [withdrawAmt, setWithdrawAmt] = useState('');
    const [mode, setMode] = useState(null); // 'fund', 'withdraw', 'edit'

    // Edit form state
    const [editName, setEditName] = useState(goal.name);
    const [editTarget, setEditTarget] = useState(goal.target);
    const [editPriority, setEditPriority] = useState(goal.priority);
    const [editCategory, setEditCategory] = useState(goal.category);
    const [editDate, setEditDate] = useState(goal.targetDate || '');

    const remaining = Math.max(0, goal.target - goal.saved);
    const pct = goal.target > 0 ? Math.round((goal.saved / goal.target) * 100) : 0;
    const isFunded = remaining <= 0;
    const plan = getMonthlySaving(goal);

    // Color based on funding
    const barColor = isFunded ? 'green' : pct >= 50 ? 'yellow' : 'red';
    const pctColor = isFunded ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';

    function handleFund(e) {
        e.preventDefault();
        const val = parseFloat(fundAmt);
        if (!val || val <= 0) return;
        dispatch({ type: 'FUND_GOAL', id: goal.id, amount: val });
        setFundAmt('');
        setMode(null);
    }

    function handleWithdraw(e) {
        e.preventDefault();
        const val = parseFloat(withdrawAmt);
        if (!val || val <= 0) return;
        dispatch({ type: 'WITHDRAW_GOAL', id: goal.id, amount: val });
        setWithdrawAmt('');
        setMode(null);
    }

    function handleEdit(e) {
        e.preventDefault();
        dispatch({
            type: 'EDIT_GOAL',
            id: goal.id,
            updates: {
                name: editName,
                target: parseFloat(editTarget),
                priority: editPriority,
                category: editCategory,
                targetDate: editDate,
            }
        });
        setMode(null);
    }

    function handlePurchase() {
        if (window.confirm(`Mark "${goal.name}" as purchased? This will remove the goal.`)) {
            dispatch({ type: 'PURCHASE_ITEM', id: goal.id });
        }
    }

    if (compact) {
        return (
            <div className="card" style={isFunded ? { borderColor: 'rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.05)' } : {}}>
                <div className="flex-between">
                    <div>
                        <div className="list-item-name" style={{ fontSize: '0.9rem' }}>
                            {goal.isBuffer ? '🛡️' : goal.isRecurring ? '🔄' : '🎯'} {goal.name}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        {isFunded ? (
                            <div className="badge success">READY</div>
                        ) : (
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: pctColor }}>{pct}%</div>
                        )}
                    </div>
                </div>
                <ProgressBar value={goal.saved} max={goal.target} color={barColor} />
                {isFunded && !goal.isBuffer && !goal.isRecurring && (
                    <button className="btn btn-sm btn-primary mt-8" onClick={handlePurchase} style={{ width: '100%' }}>Buy Now 🛒</button>
                )}
            </div>
        );
    }

    return (
        <div className="card" style={isFunded ? { borderColor: 'var(--green)', boxShadow: '0 0 15px rgba(34,197,94,0.1)' } : {}}>
            {!mode || mode !== 'edit' ? (
                <>
                    <div className="flex-between">
                        <div>
                            <div style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                {goal.isBuffer ? '🛡️' : goal.isRecurring ? '🔄' : '🎯'}
                                {goal.name}
                            </div>
                            <div className="list-item-meta" style={{ marginTop: 4 }}>
                                <span className={`badge ${goal.priority.toLowerCase()}`}>{goal.priority}</span>
                                <span className={`badge ${goal.category.toLowerCase()}`}>{goal.category}</span>
                                {goal.targetDate && <span className="badge date">📅 {goal.targetDate}</span>}
                                {goal.isRecurring && <span className="badge essential">Monthly: {goal.monthlyCost} {cur}</span>}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            {isFunded ? (
                                <div className="badge success" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Ready to Buy</div>
                            ) : (
                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: pctColor }}>{pct}%</div>
                            )}
                        </div>
                    </div>

                    <ProgressBar
                        value={goal.saved}
                        max={goal.target}
                        label={`${goal.saved.toLocaleString()} / ${goal.target.toLocaleString()}`}
                        color={barColor}
                    />

                    {isFunded && !goal.isBuffer && !goal.isRecurring && (
                        <div className="alert alert-success mt-12">
                            <span>🎉</span>
                            <div style={{ flex: 1 }}>
                                <strong>Goal reached!</strong> Use your allocated funds to make the purchase.
                                <button className="btn btn-sm btn-primary mt-8" onClick={handlePurchase} style={{ width: '100%' }}>Complete Purchase 🛒</button>
                            </div>
                        </div>
                    )}

                    {plan && !isFunded && (
                        <div className={`alert ${plan.status === 'overdue' ? 'alert-danger' : plan.status === 'due-now' ? 'alert-warning' : 'alert-info'} mt-8`}>
                            <span>{plan.status === 'overdue' ? '🚨' : plan.status === 'due-now' ? '⏳' : '📆'}</span>
                            <span>
                                {plan.status === 'overdue' ? 'Behind schedule!' :
                                    plan.status === 'due-now' ? 'Due this month!' :
                                        `Save ${plan.needed.toLocaleString()} ${cur}/month`}
                            </span>
                            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', opacity: 0.8 }}>({plan.needed.toLocaleString()} {cur} needed)</span>
                        </div>
                    )}

                    {!isFunded && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                            <button className="btn btn-sm btn-primary" onClick={() => setMode('fund')}>+ Fund</button>
                            {goal.saved > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setMode('withdraw')}>− Withdraw</button>}
                            <button className="btn btn-sm btn-ghost" onClick={() => setMode('edit')} style={{ marginLeft: goal.saved > 0 ? 0 : 'auto' }}>✏️ Edit</button>
                            {!goal.isBuffer && !goal.isRecurring && (
                                <button className="btn btn-sm btn-danger" onClick={() => dispatch({ type: 'DELETE_GOAL', id: goal.id })} style={{ marginLeft: 'auto' }}>✕</button>
                            )}
                        </div>
                    )}
                </>
            ) : (
                <form onSubmit={handleEdit}>
                    <div className="card-title">Edit Goal</div>
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%', marginBottom: 8 }} placeholder="Goal name" />
                    <div className="input-row">
                        <input type="number" value={editTarget} onChange={e => setEditTarget(e.target.value)} placeholder="Target amount" />
                        <select value={editPriority} onChange={e => setEditPriority(e.target.value)}>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                        </select>
                    </div>
                    <div className="input-row mt-8">
                        <select value={editCategory} onChange={e => setEditCategory(e.target.value)}>
                            <option value="Essential">Essential</option>
                            <option value="Productivity">Productivity</option>
                            <option value="Comfort">Comfort</option>
                            <option value="Education">Education</option>
                            <option value="Luxury">Luxury</option>
                        </select>
                        <input type="month" value={editDate} onChange={e => setEditDate(e.target.value)} />
                    </div>
                    <div className="flex-between mt-12">
                        <button className="btn btn-ghost" type="button" onClick={() => setMode(null)}>Cancel</button>
                        <button className="btn btn-primary" type="submit">Save Changes</button>
                    </div>
                </form>
            )}

            {mode === 'fund' && (
                <form onSubmit={handleFund} className="input-row mt-12">
                    <input
                        type="number"
                        placeholder="Amount"
                        value={fundAmt}
                        onChange={e => setFundAmt(e.target.value)}
                        max={Math.min(remaining, cash + balance)}
                        autoFocus
                    />
                    <button className="btn btn-sm btn-primary" type="submit">Add</button>
                    <button className="btn btn-sm btn-ghost" type="button" onClick={() => setMode(null)}>✕</button>
                </form>
            )}

            {mode === 'withdraw' && (
                <form onSubmit={handleWithdraw} className="input-row mt-12">
                    <input type="number" placeholder="Amount" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)} max={goal.saved} autoFocus />
                    <button className="btn btn-sm btn-danger" type="submit">Back to Cash</button>
                    <button className="btn btn-sm btn-ghost" type="button" onClick={() => setMode(null)}>✕</button>
                </form>
            )}
        </div>
    );
}
