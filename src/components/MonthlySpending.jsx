import { useState } from 'react';
import { useStore } from '../store';

export default function MonthlySpending() {
    const { state, dispatch } = useStore();
    const { monthly, goals, settings } = state;
    const bufferGoal = goals.find(g => g.isBuffer);
    const available = bufferGoal ? bufferGoal.saved : 0;
    const cur = settings.currency;

    const [isEditing, setIsEditing] = useState(false);
    const [newBudget, setNewBudget] = useState(monthly.budget);
    const [expenseName, setExpenseName] = useState('');
    const [expenseAmt, setExpenseAmt] = useState('');

    const pct = monthly.budget > 0 ? (monthly.spent / monthly.budget) * 100 : 0;

    return (
        <div>
            <div className="section-title">💳 Spending Tracker</div>

            {/* Budget */}
            <div className="card">
                <div className="flex-between">
                    <div className="card-title">Monthly Survival Needs</div>
                    {!isEditing
                        ? <button className="btn btn-sm btn-ghost" onClick={() => setIsEditing(true)}>Edit</button>
                        : <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm btn-primary" onClick={() => { dispatch({ type: 'SET_MONTHLY_BUDGET', value: parseFloat(newBudget) || 200 }); setIsEditing(false); }}>Save</button>
                            <button className="btn btn-sm btn-ghost" aria-label="Cancel Edit" onClick={() => setIsEditing(false)}>✕</button>
                        </div>
                    }
                </div>
                {isEditing
                    ? <div className="input-row mt-8"><input type="number" aria-label="Monthly Budget" value={newBudget} onChange={e => setNewBudget(e.target.value)} /><span className="text-muted">{cur}</span></div>
                    : <div className="card-value">{monthly.budget.toLocaleString()} {cur}</div>
                }
                <div className="card-sub">This amount drives the buffer target. Changing it updates the buffer target instantly.</div>
            </div>

            {/* Current Balance reminder */}
            <div className="card" style={{ background: 'rgba(59,130,246,0.05)', border: '1px dashed rgba(59,130,246,0.3)' }}>
                <div className="card-title" style={{ fontSize: '0.8rem' }}>💳 Available Balance</div>
                <div className="card-value" style={{ fontSize: '1.4rem', color: available < 30 ? 'var(--yellow)' : 'var(--green)' }}>{available.toLocaleString()} {cur}</div>
                <div className="card-sub">Expenses are deducted from your Current Balance.</div>
            </div>

            {/* Spending Progress */}
            <div className="card">
                <div className="card-title">This Month's Spending</div>
                <div className="mini-grid mb-8">
                    <div className="mini-card"><div className="label">Spent</div><div className="value" style={{ color: pct > 100 ? 'var(--red)' : 'inherit' }}>{monthly.spent.toLocaleString()} {cur}</div></div>
                    <div className="mini-card"><div className="label">Budget</div><div className="value">{monthly.budget.toLocaleString()} {cur}</div></div>
                    <div className="mini-card"><div className="label">Left</div><div className="value text-green">{Math.max(0, monthly.budget - monthly.spent).toLocaleString()} {cur}</div></div>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', borderRadius: 4, transition: 'width 0.3s',
                        width: `${Math.min(100, pct)}%`,
                        background: pct > 100 ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)',
                    }} />
                </div>
                {pct > 100 && <div className="alert alert-danger mt-8"><span>🚨</span><span>Budget exceeded!</span></div>}
            </div>

            {/* Add Expense */}
            <div className="card">
                <div className="card-title">Log Expense</div>
                <form onSubmit={e => {
                    e.preventDefault();
                    const amt = parseFloat(expenseAmt);
                    if (!expenseName.trim() || !amt || amt <= 0) return;
                    dispatch({ type: 'ADD_EXPENSE', name: expenseName.trim(), amount: amt });
                    setExpenseName(''); setExpenseAmt('');
                }}>
                    <div className="input-row">
                        <input type="text" aria-label="Expense Item" placeholder="Item (e.g. Groceries)" value={expenseName} onChange={e => setExpenseName(e.target.value)} />
                        <input type="number" aria-label="Expense Amount" placeholder="Amt" value={expenseAmt} onChange={e => setExpenseAmt(e.target.value)} min="0" style={{ maxWidth: 100 }} />
                        <button className="btn btn-primary" aria-label="Add Expense" type="submit">+</button>
                    </div>
                </form>
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {['Groceries', 'Transport', 'Coffee', 'Pharmacy'].map(s => (
                        <button key={s} className="btn btn-sm btn-ghost" onClick={() => setExpenseName(s)} style={{ fontSize: '0.7rem' }}>{s}</button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <button 
                        className="btn btn-sm btn-ghost" 
                        onClick={() => {
                            if (confirm('Add a test weekly payment (backdated 8 days) to verify auto-deduction?')) {
                                // Set last_applied_date to 8 days ago, so a weekly cut (7 days) is due!
                                const backdated = new Date(Date.now() - 8 * 86_400_000).toISOString();
                                dispatch({ 
                                    type: 'ADD_RECURRING_EXPENSE', 
                                    expense: { name: 'Weekly Test', amount: 10, period: 'weekly', last_applied_date: backdated } 
                                });
                            }
                        }}
                        style={{ fontSize: '0.7rem', color: 'var(--purple)', border: '1px dashed var(--purple)', opacity: 0.8 }}
                    >
                        🧪 Hard Test (Weekly)
                    </button>
                </div>
            </div>

            {/* Expense History */}
            <div className="card">
                <div className="flex-between mb-8">
                    <div className="card-title" style={{ margin: 0 }}>Expenses</div>
                    <button className="btn btn-sm btn-ghost" onClick={() => { if (confirm('Reset monthly data?')) dispatch({ type: 'RESET_MONTHLY' }); }}>Reset Month</button>
                </div>
                {monthly.expenses.length === 0
                    ? <div className="empty-state">No expenses yet</div>
                    : monthly.expenses.slice().reverse().map(exp => (
                        <div key={exp.id} className="list-item" style={exp.isRecurring ? { borderLeft: '2px solid var(--purple, #a78bfa)', paddingLeft: 10 } : {}}>
                            <div className="list-item-info">
                                <div className="list-item-name">
                                    {exp.isRecurring && <span title="Auto-deducted recurring payment" style={{ marginRight: 5, fontSize: '0.75em', opacity: 0.8 }}>🔁</span>}
                                    {exp.name}
                                </div>
                                <div className="list-item-meta">{new Date(exp.date).toLocaleDateString()}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontWeight: 700 }}>{exp.amount.toLocaleString()} {cur}</span>
                                {!exp.isRecurring && (
                                    <button className="btn btn-sm btn-ghost" aria-label="Delete Expense" onClick={() => dispatch({ type: 'DELETE_EXPENSE', id: exp.id })} style={{ color: 'var(--red)', padding: '2px 6px' }}>✕</button>
                                )}
                            </div>
                        </div>
                    ))
                }
            </div>
        </div>
    );
}
