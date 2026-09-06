import { useState, lazy, Suspense } from 'react';
import { useStore } from '../store';
import { monthlyEssentials } from '../utils/storeUtils';
import { getWeightedMonthlyBurn } from '../utils/spendingInsights';
import {
    IconWallet, IconBanknote, IconChart, IconEdit, IconCheck, IconX,
    IconPlus, IconTrash, IconAlertTriangle, IconRepeat, IconArrowRight,
} from './icons';

// Recharts is heavy (~200 kB gzip). Load it only when the Spending tab renders
// so it never weighs down the initial dashboard bundle.
const SpendingInsights = lazy(() => import('./SpendingInsights'));

/** "2026-07" → "July 2026" (built from parts to avoid timezone drift). */
function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

export default function MonthlySpending() {
    const { state, dispatch } = useStore();
    const { monthly, goals, settings } = state;
    const bufferGoal = goals.find(g => g.isBuffer);
    const available = bufferGoal ? bufferGoal.saved : 0;
    const cur = settings.currency;

    // The ledger is append-only across all months. Browse any month here; the
    // full history also powers the insights above.
    const currentMonth = new Date().toISOString().slice(0, 7);
    const ledger = monthly.expenses || [];
    const monthsWithData = Array.from(
        new Set(ledger.filter(e => typeof e.date === 'string').map(e => e.date.slice(0, 7))),
    );
    const browsableMonths = Array.from(new Set([...monthsWithData, currentMonth])).sort(); // ascending
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    // Selected month may vanish after deletes — fall back to the current month.
    const activeMonth = browsableMonths.includes(selectedMonth) ? selectedMonth : currentMonth;
    const monthIdx = browsableMonths.indexOf(activeMonth);
    const monthExpenses = ledger.filter(e => e.date?.slice(0, 7) === activeMonth);
    const monthTotal = monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const isCurrentMonth = activeMonth === currentMonth;

    const [isEditing, setIsEditing] = useState(false);
    const [newBudget, setNewBudget] = useState(monthly.budget);
    const [expenseName, setExpenseName] = useState('');
    const [expenseAmt, setExpenseAmt] = useState('');
    const [expenseDate, setExpenseDate] = useState('');

    // Adaptive buffer basis: the recency-weighted average of realised monthly
    // spend, floored at declared survival essentials. Surfaced so the user can
    // see what the (now dynamic) buffer target is actually tracking.
    const essentials = monthlyEssentials(state);
    const adaptiveBurn = getWeightedMonthlyBurn(monthly.expenses || []);
    const isAdaptive = adaptiveBurn != null && adaptiveBurn > essentials;

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
                                step="any"
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
                <div className="card-sub">
                    {isAdaptive
                        ? <>Buffer now tracks your recent spending — a recency-weighted average of <strong>~{Math.round(adaptiveBurn).toLocaleString()} {cur}/mo</strong>, above this floor. It follows your habits and never drops below your survival needs.</>
                        : <>Drives the buffer target as a floor. Once your logged months average more than this, the buffer adapts up to follow your real spending.</>
                    }
                </div>
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
                    
                    let finalDate;
                    if (expenseDate) {
                        const [y, m, d] = expenseDate.split('-');
                        finalDate = new Date(y, m - 1, d, 12).toISOString();
                    }

                    dispatch({ type: 'ADD_EXPENSE', name: expenseName.trim(), amount: amt, date: finalDate });
                    setExpenseName(''); setExpenseAmt(''); setExpenseDate('');
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
                            step="any"
                            aria-label="Expense amount"
                            placeholder="Amt"
                            value={expenseAmt}
                            onChange={e => setExpenseAmt(e.target.value)}
                            min="0"
                            style={{ maxWidth: 110 }}
                        />
                        <input
                            type="date"
                            aria-label="Expense date"
                            value={expenseDate}
                            onChange={e => setExpenseDate(e.target.value)}
                            style={{ maxWidth: 130 }}
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

            {/* Expense History — browse any month; the ledger keeps full history */}
            <section className="card">
                <div className="flex-between mb-3">
                    <div className="row-tight">
                        <button
                            className="btn btn-sm btn-ghost btn-icon"
                            aria-label="Previous month"
                            disabled={monthIdx <= 0}
                            onClick={() => setSelectedMonth(browsableMonths[monthIdx - 1])}
                        >
                            <IconArrowRight style={{ transform: 'rotate(180deg)' }} />
                        </button>
                        <div className="card-title" style={{ margin: 0, minWidth: 128, textAlign: 'center' }}>
                            {monthLabel(activeMonth)}
                            {isCurrentMonth && <span className="text-muted" style={{ fontWeight: 400 }}> · now</span>}
                        </div>
                        <button
                            className="btn btn-sm btn-ghost btn-icon"
                            aria-label="Next month"
                            disabled={monthIdx >= browsableMonths.length - 1}
                            onClick={() => setSelectedMonth(browsableMonths[monthIdx + 1])}
                        >
                            <IconArrowRight />
                        </button>
                    </div>
                    <span className="mono text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                        {Math.round(monthTotal).toLocaleString()} {cur}
                    </span>
                </div>
                {monthExpenses.length === 0
                    ? <div className="empty-state">No expenses in {monthLabel(activeMonth)}</div>
                    : monthExpenses.slice().reverse().map(exp => (
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
                {!isCurrentMonth && monthExpenses.length > 0 && (
                    <div className="card-sub mt-2" style={{ textAlign: 'center' }}>Past months are read-only history.</div>
                )}
            </section>
        </div>
    );
}
