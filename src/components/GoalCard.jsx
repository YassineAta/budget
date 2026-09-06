import { useState, useMemo, memo } from 'react';
import { useStore, getMonthlySaving, formatTargetDate, toDateInputValue } from '../store';
import ProgressBar from './ProgressBar';
import { calculateProgress } from '../utils/math';
import {
    IconShield, IconTarget, IconHeart, IconCalendar, IconCart,
    IconCheckCircle, IconAlertOctagon, IconClock,
    IconPlus, IconMinus, IconEdit, IconTrash, IconX, IconCheck,
} from './icons';

function goalIcon(goal) {
    if (goal.isBuffer) return IconShield;
    if (goal.type === 'wishlist') return IconHeart;
    return IconTarget;
}

function goalIconClass(goal) {
    if (goal.isBuffer) return 'buffer';
    if (goal.type === 'wishlist') return 'wishlist';
    return '';
}

const GoalCard = memo(function GoalCard({ goal, compact = false }) {
    const { state, dispatch } = useStore();
    const { cash, settings } = state;
    const cur = settings.currency;

    const [fundAmt, setFundAmt] = useState('');
    const [withdrawAmt, setWithdrawAmt] = useState('');
    const [mode, setMode] = useState(null);

    const [editName, setEditName] = useState(goal.name);
    const [editTarget, setEditTarget] = useState(goal.target);
    const [editPriority, setEditPriority] = useState(goal.priority);
    const [editCategory, setEditCategory] = useState(goal.category);
    const [editDate, setEditDate] = useState(toDateInputValue(goal.targetDate));
    const [editType, setEditType] = useState(goal.type || 'saving');

    const { remaining, pct, isFunded, plan, barColor, pctColor } = useMemo(() => {
        const progress = calculateProgress(goal.saved, goal.target);
        return { ...progress, plan: getMonthlySaving(goal) };
    }, [goal]);

    const Icon = goalIcon(goal);
    const iconKindClass = goalIconClass(goal);
    const isPurchasable = isFunded && !goal.isBuffer && goal.type !== 'wishlist';

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
        const parsedTarget = parseFloat(editTarget);
        // Guard against NaN/negative (empty field) reaching the store, where it
        // would fail schema validation on the next reload.
        if (!Number.isFinite(parsedTarget) || parsedTarget < 0) return;
        dispatch({
            type: 'EDIT_GOAL',
            id: goal.id,
            updates: {
                name: editName,
                target: parsedTarget,
                priority: editPriority,
                category: editCategory,
                targetDate: editDate,
                type: editType,
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
            <div className={`card ${isFunded ? 'highlight' : ''}`}>
                <div className="flex-between">
                    <div className={`goal-name ${iconKindClass}`}>
                        <Icon />
                        {goal.name}
                    </div>
                    <div className="row-tight">
                        {isFunded ? (
                            <span className="badge success">
                                <IconCheckCircle />
                                {goal.isBuffer ? 'Funded' : 'Ready'}
                            </span>
                        ) : (
                            <span className="goal-pct" style={{ color: pctColor }}>{pct}%</span>
                        )}
                    </div>
                </div>
                <ProgressBar value={goal.saved} max={goal.target} color={barColor} />
                {isPurchasable && (
                    <button className="btn btn-sm btn-primary w-full mt-3" onClick={handlePurchase}>
                        <IconCart /> Buy Now
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className={`card ${isFunded ? 'highlight' : ''}`}>
            {(!mode || mode !== 'edit') ? (
                <>
                    <div className="goal-head">
                        <div>
                            <div className={`goal-name ${iconKindClass}`}>
                                <Icon />
                                {goal.name}
                            </div>
                            <div className="list-item-meta mt-2">
                                {goal.priority && <span className={`badge ${goal.priority.toLowerCase()}`}>{goal.priority}</span>}
                                {goal.category && <span className={`badge ${goal.category.toLowerCase()}`}>{goal.category}</span>}
                                {goal.targetDate && (
                                    <span className="badge date">
                                        <IconCalendar /> {formatTargetDate(goal.targetDate)}
                                    </span>
                                )}
                                {goal.type === 'wishlist' && (
                                    <span className="badge wishlist">Wishlist</span>
                                )}
                            </div>
                        </div>
                        <div>
                            {isFunded ? (
                                <span className="badge success">
                                    <IconCheckCircle />
                                    {goal.isBuffer ? 'Funded' : 'Ready'}
                                </span>
                            ) : (
                                <span className="goal-pct" style={{ color: pctColor }}>{pct}%</span>
                            )}
                        </div>
                    </div>

                    <ProgressBar
                        value={goal.saved}
                        max={goal.target}
                        label={`${goal.saved.toLocaleString()} / ${goal.target.toLocaleString()}`}
                        color={barColor}
                    />

                    {isPurchasable && (
                        <div className="alert alert-success mt-3" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                            <div className="row">
                                <IconCheckCircle />
                                <strong>Goal reached.</strong>
                                <span style={{ flex: 1 }}>Use your allocated funds to purchase.</span>
                            </div>
                            <button className="btn btn-sm btn-primary mt-2 w-full" onClick={handlePurchase}>
                                <IconCart /> Complete Purchase
                            </button>
                        </div>
                    )}

                    {plan && !isFunded && (
                        <div className={`alert ${plan.status === 'overdue' ? 'alert-danger' : plan.status === 'due-now' ? 'alert-warning' : 'alert-info'} mt-2`}>
                            {plan.status === 'overdue' ? <IconAlertOctagon /> : plan.status === 'due-now' ? <IconClock /> : <IconCalendar />}
                            <span style={{ flex: 1 }}>
                                {plan.status === 'overdue'
                                    ? `Behind — ${plan.needed.toLocaleString()} ${cur} to finish`
                                    : plan.status === 'due-now'
                                        ? `Due now — ${plan.needed.toLocaleString()} ${cur} to finish`
                                        : `Save ${plan.needed.toLocaleString()} ${cur}/month`}
                            </span>
                            <span className="mono text-dim" style={{ fontSize: 'var(--text-2xs)' }}>
                                {plan.days < 0
                                    ? `${Math.abs(plan.days)}d overdue`
                                    : plan.days === 0
                                        ? 'due today'
                                        : `in ${plan.days}d`}
                            </span>
                        </div>
                    )}

                    <div className="goal-actions">
                        {!isFunded && goal.type !== 'wishlist' && (
                            <button className="btn btn-sm btn-primary" onClick={() => setMode('fund')}>
                                <IconPlus /> Fund
                            </button>
                        )}
                        {goal.saved > 0 && (
                            <button className="btn btn-sm btn-ghost" onClick={() => setMode('withdraw')}>
                                <IconMinus /> Withdraw
                            </button>
                        )}
                        <button className="btn btn-sm btn-ghost" onClick={() => setMode('edit')}>
                            <IconEdit /> Edit
                        </button>
                        {!goal.isBuffer && (
                            <button
                                className="btn btn-sm btn-danger btn-icon"
                                aria-label="Delete goal"
                                onClick={() => dispatch({ type: 'DELETE_GOAL', id: goal.id })}
                            >
                                <IconTrash />
                            </button>
                        )}
                    </div>
                </>
            ) : (
                <form onSubmit={handleEdit}>
                    <div className="card-title"><IconEdit /> Edit Goal</div>
                    <input
                        type="text"
                        aria-label="Goal name"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        style={{ width: '100%' }}
                        placeholder="Goal name"
                    />
                    <div className="input-row">
                        <input
                            type="number"
                            step="any"
                            aria-label="Target amount"
                            value={editTarget}
                            onChange={e => setEditTarget(e.target.value)}
                            placeholder="Target amount"
                        />
                        <select aria-label="Priority" value={editPriority} onChange={e => setEditPriority(e.target.value)}>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                        </select>
                    </div>
                    <div className="input-row">
                        <select aria-label="Category" value={editCategory} onChange={e => setEditCategory(e.target.value)}>
                            <option value="Essential">Essential</option>
                            <option value="Productivity">Productivity</option>
                            <option value="Comfort">Comfort</option>
                            <option value="Education">Education</option>
                            <option value="Luxury">Luxury</option>
                        </select>
                        <input type="date" aria-label="Target date" value={editDate} onChange={e => setEditDate(e.target.value)} />
                    </div>
                    {!goal.isBuffer && (
                        <div className="input-row">
                            <select aria-label="Goal type" value={editType} onChange={e => setEditType(e.target.value)} style={{ flex: 1 }}>
                                <option value="saving">Saving Goal</option>
                                <option value="wishlist">Wishlist (no balance effect)</option>
                            </select>
                        </div>
                    )}
                    <div className="flex-between mt-4">
                        <button className="btn btn-ghost" type="button" onClick={() => setMode(null)}>
                            <IconX /> Cancel
                        </button>
                        <button className="btn btn-primary" type="submit">
                            <IconCheck /> Save
                        </button>
                    </div>
                </form>
            )}

            {mode === 'fund' && (
                <form onSubmit={handleFund} className="input-row">
                    <input
                        type="number"
                        step="any"
                        placeholder="Amount"
                        value={fundAmt}
                        onChange={e => setFundAmt(e.target.value)}
                        max={Math.min(remaining, cash)}
                        autoFocus
                    />
                    <button className="btn btn-sm btn-primary" type="submit">
                        <IconPlus /> Add
                    </button>
                    <button
                        className="btn btn-sm btn-ghost btn-icon"
                        type="button"
                        aria-label="Close"
                        onClick={() => setMode(null)}
                    >
                        <IconX />
                    </button>
                </form>
            )}

            {mode === 'withdraw' && (
                <form onSubmit={handleWithdraw} className="input-row">
                    <input
                        type="number"
                        step="any"
                        placeholder="Amount"
                        value={withdrawAmt}
                        onChange={e => setWithdrawAmt(e.target.value)}
                        max={goal.saved}
                        autoFocus
                    />
                    <button className="btn btn-sm btn-danger" type="submit">
                        <IconMinus /> Back to Cash
                    </button>
                    <button
                        className="btn btn-sm btn-ghost btn-icon"
                        type="button"
                        aria-label="Close"
                        onClick={() => setMode(null)}
                    >
                        <IconX />
                    </button>
                </form>
            )}
        </div>
    );
});

export default GoalCard;
