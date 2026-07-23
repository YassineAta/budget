import { useState, lazy, Suspense } from 'react';
import { useStore } from '../store';
import {
    IconWallet, IconBanknote, IconChart, IconEdit, IconCheck, IconX,
    IconPlus, IconTrash, IconAlertTriangle, IconRepeat,
} from './icons';

// Recharts is heavy (~200 kB gzip). Load it only when the Spending tab renders
// so it never weighs down the initial dashboard bundle.
const SpendingInsights = lazy(() => import('./SpendingInsights'));

export default function MonthlySpending() {
    const { state, dispatch } = useStore();
    const { monthly, goals, settings } = state;
    const bufferGoal = goals.find(g => g.isBuffer);
    const available = bufferGoal ? bufferGoal.saved : 0;
    const cur = settings.currency;

    // The ledger is append-only across months; this view shows the current month.
    const currentMonth = new Date().toISOString().slice(0, 7);
    const thisMonthExpenses = (monthly.expenses || []).filter(
        e => typeof e.date === 'string' && e.date.slice(0, 7) === currentMonth,
    );

    const [isEditing, setIsEditing] = useState(false);
    const [newBudget, setNewBudget] = useState(monthly.budget);
    const [expenseName, setExpenseName] = useState('');
    const [expenseAmt, setExpenseAmt] = useState('');

    const pct = monthly.budget > 0 ? (monthly.spent / monthly.budget) * 100 : 0;
    const spentColor = pct > 100 ? 'text-red' : '';
    const balanceColor = available < 30 ? 'text-yellow' : 'text-green';

    return (
        <div>
            <div className="section-title"><IconWallet /> Spending Tracker</div>

            {/* Budget */}
            <section className="card">
                <div className="flex-between">
                    <div className="card-title"><IconChart /> Monthly Survival Needs</div>
                    {!isEditing
                        ? (
                            <button className="btn btn-sm btn-ghost" onClick={() => setIsEditing(true)}>
                                <IconEdit /> Edit
                            </button>
                        )
                        : (
                            <div className="row-tight">
                                <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() => {
                                        dispatch({ type: 'SET_MONTHLY_BUDGET', value: parseFloat(newBudget) || 200 });
                                        setIsEditing(false);
                                    }}
                                >
                                    <IconCheck /> Save
                                </button>
                                <button
                                    className="btn btn-sm btn-ghost btn-icon"
                                    aria-label="Cancel edit"
                                    onClick={() => setIsEditing(false)}
                                >
                                    <IconX />
                                </button>
                            </div>
                        )
                    }
                </div>
                {isEditing
                    ? (
                        <div className="input-row">
                            <input
                                type="number"
                                aria-label="Monthly budget"
                                value={newBudget}
                                onChange={e => setNewBudget(e.target.value)}
                                autoFocus
                            />
                            <span className="row text-muted mono" style={{ minWidth: 32 }}>{cur}</span>
                        </div>
                    )
                    : (
                        <div className="card-value mono">
                            {monthly.budget.toLocaleString()} <span style={{ fontSize: '0.5em', opacity: 0.6 }}>{cur}</span>
                        </div>
                    )
                }
                <div className="card-sub">Drives the buffer target. Changing it updates the buffer instantly.</div>
            </section>

            {/* Available Balance */}
            <section className="card subtle">
                <div className="card-title"><IconBanknote /> Available Balance</div>
                <div className={`card-value mono ${balanceColor}`} style={{ fontSize: 'var(--text-2xl)' }}>
                    {available.toLocaleString()} <span style={{ fontSize: '0.5em', opacity: 0.6 }}>{cur}</span>
                </div>
                <div className="card-sub">Expenses are deducted from this balance.</div>
            </section>

            {/* Spending Progress */}
            <section className="card">
                <div className="card-title"><IconChart /> This Month's Spending</div>
                <div className="mini-grid mb-3">
                    <div className="mini-card">
                        <div className="label">Spent</div>
                        <div className={`value ${spentColor}`}>{monthly.spent.toLocaleString()} {cur}</div>
                    </div>
                    <div className="mini-card">
                        <div className="label">Budget</div>
                        <div className="value">{monthly.budget.toLocaleString()} {cur}</div>
                    </div>
                    <div className="mini-card">
                        <div className="label">Left</div>
                        <div className="value text-green">{Math.max(0, monthly.budget - monthly.spent).toLocaleString()} {cur}</div>
                    </div>
                </div>
                <div className="progress-track">
                    <div
                        className={`progress-fill ${pct > 100 ? 'red' : pct >= 80 ? 'yellow' : 'green'}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                    />
                </div>
                {pct > 100 && (
                    <div className="alert alert-danger mt-3">
                        <IconAlertTriangle />
                        <span>Budget exceeded</span>
                    </div>
                )}
            </section>

            {/* Behaviour analytics */}
            <Suspense fallback={<section className="card subtle"><div className="empty-state">Loading insights…</div></section>}>
                <SpendingInsights state={state} />
            </Suspense>

            {/* Add Expense */}
            <section className="card">
                <div className="card-title"><IconPlus /> Log Expense</div>
                <form onSubmit={e => {
                    e.preventDefault();
                    const amt = parseFloat(expenseAmt);
                    if (!expenseName.trim() || !amt || amt <= 0) return;
                    dispatch({ type: 'ADD_EXPENSE', name: expenseName.trim(), amount: amt });
                    setExpenseName(''); setExpenseAmt('');
                }}>
                    <div className="input-row">
                        <input
                            type="text"
                            aria-label="Expense item"
                            placeholder="Item (e.g. Groceries)"
                            value={expenseName}
                            onChange={e => setExpenseName(e.target.value)}
                        />
                        <input
                            type="number"
                            aria-label="Expense amount"
                            placeholder="Amt"
                            value={expenseAmt}
                            onChange={e => setExpenseAmt(e.target.value)}
                            min="0"
                            style={{ maxWidth: 110 }}
                        />
                        <button className="btn btn-primary btn-icon" aria-label="Add expense" type="submit">
                            <IconPlus />
                        </button>
                    </div>
                </form>
                <div className="cluster mt-3">
                    {['Groceries', 'Transport', 'Coffee', 'Pharmacy'].map(s => (
                        <button
                            key={s}
                            className="btn btn-sm btn-ghost"
                            onClick={() => setExpenseName(s)}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </section>

            {/* Expense History (current month — full history is retained for insights) */}
            <section className="card">
                <div className="flex-between mb-3">
                    <div className="card-title" style={{ margin: 0 }}>This Month's Expenses</div>
                    <span className="text-muted mono" style={{ fontSize: 'var(--text-xs)' }}>
                        {thisMonthExpenses.length} item{thisMonthExpenses.length === 1 ? '' : 's'}
                    </span>
                </div>
                {thisMonthExpenses.length === 0
                    ? <div className="empty-state">No expenses yet this month</div>
                    : thisMonthExpenses.slice().reverse().map(exp => (
                        <div key={exp.id} className={`list-item ${exp.isRecurring ? 'recurring' : ''}`}>
                            <div className="list-item-info">
                                <div className="list-item-name row-tight">
                                    {exp.isRecurring && (
                                        <IconRepeat
                                            size={12}
                                            aria-label="Auto-deducted recurring"
                                            style={{ color: 'var(--purple)' }}
                                        />
                                    )}
                                    {exp.name}
                                </div>
                                <div className="list-item-meta">{new Date(exp.date).toLocaleDateString()}</div>
                            </div>
                            <div className="row">
                                <span className="list-item-amount">{exp.amount.toLocaleString()} {cur}</span>
                                <button
                                    className="btn btn-sm btn-ghost btn-icon"
                                    aria-label={`Delete ${exp.name}`}
                                    onClick={() => dispatch({ type: 'DELETE_EXPENSE', id: exp.id })}
                                    style={{ color: 'var(--red)' }}
                                >
                                    <IconTrash />
                                </button>
                            </div>
                        </div>
                    ))
                }
            </section>
        </div>
    );
}
