import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { useStore, getMonthlySaving, formatTargetDate, toDateInputValue } from '../store';
import ProgressBar from './ProgressBar';
import { calculateProgress } from '../utils/math';
import { fetchNav, isNavStale } from '../utils/navFetcher';
import { TUNISIAN_FUNDS } from '../utils/tunisianFunds';
import {
    IconShield, IconTarget, IconHeart, IconCalendar, IconCart,
    IconCheckCircle, IconAlertOctagon, IconClock,
    IconPlus, IconMinus, IconEdit, IconTrash, IconX, IconCheck,
    IconChart, IconRepeat,
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

    // Placement (SICAV/FCP) state
    const [navLoading, setNavLoading] = useState(false);
    const [navError, setNavError] = useState(null);
    const [placementDraft, setPlacementDraft] = useState(null);
    const autoFetched = useRef(false);

    const [editName, setEditName] = useState(goal.name);
    const [editTarget, setEditTarget] = useState(goal.target);
    const [editPriority, setEditPriority] = useState(goal.priority);
    const [editCategory, setEditCategory] = useState(goal.category);
    const [editDate, setEditDate] = useState(toDateInputValue(goal.targetDate));
    const [editType, setEditType] = useState(goal.type || 'saving');

    const { remaining, pct, isFunded, plan, barColor, pctColor, placementValue } = useMemo(() => {
        // Sum current market value of all SICAV/FCP funds from cached NAVs.
        // This is external money — never touches goal.saved or cash.
        const placementValue = (goal.placement?.funds || []).reduce((sum, f) => {
            const cached = goal.placement?.navCache?.[f.slug];
            return sum + (cached ? Number(cached.nav) * Number(f.units) : 0);
        }, 0);
        // Progress bar reflects combined (saved + placement) / target so the
        // user sees the full picture, but remaining is capped to in-app savings
        // only so the Fund form never lets them over-allocate from cash.
        const progress = calculateProgress(goal.saved + placementValue, goal.target);
        const remaining = Math.max(0, goal.target - goal.saved);
        return { ...progress, remaining, plan: getMonthlySaving({ ...goal, saved: goal.saved + placementValue }), placementValue };
    }, [goal]);

    const Icon = goalIcon(goal);
    const iconKindClass = goalIconClass(goal);
    // Use raw saved (not combined) so placement value doesn't trigger the purchase
    // button — the money must actually be in-app to complete a purchase.
    const isPurchasable = goal.saved >= goal.target && !goal.isBuffer && goal.type !== 'wishlist';

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

    async function fetchAllNavs(funds) {
        const targets = funds || goal.placement?.funds;
        if (!targets?.length) return;
        setNavLoading(true);
        setNavError(null);
        const failed = [];
        await Promise.all(targets.map(async f => {
            try {
                const nav = await fetchNav(f.slug);
                dispatch({ type: 'UPDATE_NAV_CACHE', id: goal.id, slug: f.slug, nav });
            } catch (e) {
                console.error(`[NAV] ${f.label}:`, e.message);
                failed.push(f.label);
            }
        }));
        setNavLoading(false);
        if (failed.length) setNavError(`Couldn't fetch: ${failed.join(', ')}. Check console for details.`);
    }

    // Auto-refresh stale NAVs on mount (once per component lifetime).
    useEffect(() => {
        if (autoFetched.current || !goal.placement?.funds?.length) return;
        const stale = goal.placement.funds.some(f => isNavStale(goal.placement?.navCache?.[f.slug]?.fetchedAt));
        if (!stale) return;
        autoFetched.current = true;
        fetchAllNavs(goal.placement.funds);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
                        value={goal.saved + placementValue}
                        max={goal.target}
                        label={placementValue > 0
                            ? `${(goal.saved + placementValue).toLocaleString()} / ${goal.target.toLocaleString()}`
                            : `${goal.saved.toLocaleString()} / ${goal.target.toLocaleString()}`}
                        color={barColor}
                    />

                    {/* Investment panel */}
                    {goal.placement?.funds?.length > 0 && (
                        <div className="mt-3" style={{
                            background: 'var(--blue-soft)',
                            border: '1px solid rgba(107,140,175,0.2)',
                            borderRadius: 'var(--radius-sm)',
                            padding: 'var(--space-3) var(--space-4)',
                        }}>
                            <div className="flex-between" style={{ marginBottom: 'var(--space-3)' }}>
                                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                    <IconChart size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                    Investments
                                </span>
                                <button
                                    className="btn btn-ghost btn-icon btn-sm"
                                    onClick={() => fetchAllNavs()}
                                    disabled={navLoading}
                                    title="Refresh NAV from millim.tn"
                                    style={{ color: 'var(--text-dim)' }}
                                >
                                    {navLoading
                                        ? <span style={{ fontSize: 'var(--text-xs)', padding: '0 2px' }}>…</span>
                                        : <IconRepeat size={13} />}
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                {goal.placement.funds.map(f => {
                                    const cached = goal.placement?.navCache?.[f.slug];
                                    const val = cached ? cached.nav * f.units : null;
                                    return (
                                        <div key={f.slug} className="flex-between" style={{ alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1, marginRight: 'var(--space-3)', minWidth: 0 }}>
                                                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {f.label}
                                                </div>
                                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', marginTop: 2 }}>
                                                    {f.units} units · NAV {cached
                                                        ? `${cached.nav.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${cur}`
                                                        : '—'}
                                                </div>
                                            </div>
                                            <div className="mono" style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: val != null ? 'var(--text)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                                                {val != null ? `${Math.round(val).toLocaleString()} ${cur}` : '—'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex-between" style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid rgba(107,140,175,0.18)' }}>
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)' }}>
                                    {(() => {
                                        const dates = Object.values(goal.placement?.navCache || {}).map(c => new Date(c.fetchedAt));
                                        if (!dates.length) return 'No data yet — click ↻';
                                        const oldest = new Date(Math.min(...dates));
                                        const h = Math.round((Date.now() - oldest) / 3_600_000);
                                        return h < 1 ? 'Updated just now · millim.tn' : `Updated ${h}h ago · millim.tn`;
                                    })()}
                                </span>
                                <span className="mono" style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--blue)' }}>
                                    {placementValue > 0 ? `${Math.round(placementValue).toLocaleString()} ${cur}` : '—'}
                                </span>
                            </div>

                            {navError && (
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', marginTop: 'var(--space-2)', display: 'flex', gap: 'var(--space-1)', alignItems: 'flex-start' }}>
                                    <span style={{ color: 'var(--yellow)', flexShrink: 0 }}>⚠</span>
                                    {navError}
                                </div>
                            )}
                        </div>
                    )}

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
                                className="btn btn-sm btn-ghost"
                                onClick={() => {
                                    setPlacementDraft(
                                        goal.placement?.funds?.length
                                            ? goal.placement.funds.map(f => ({ ...f, units: String(f.units) }))
                                            : [{ slug: '', label: '', units: '' }]
                                    );
                                    setMode('placement');
                                }}
                                title="Link investment funds (SICAV / FCP)"
                            >
                                <IconChart /> Invest
                            </button>
                        )}
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

            {mode === 'placement' && placementDraft && (
                <div className="mt-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)' }}>
                    <div className="card-title mb-3"><IconChart /> Link Investment Funds</div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        {placementDraft.map((entry, i) => (
                            <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)' }}>
                                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                                    <select
                                        value={entry.slug}
                                        onChange={e => {
                                            const fund = TUNISIAN_FUNDS.find(f => f.slug === e.target.value);
                                            setPlacementDraft(d => d.map((x, j) => j === i
                                                ? { ...x, slug: e.target.value, label: fund?.label || '' }
                                                : x
                                            ));
                                        }}
                                        style={{ flex: 1 }}
                                    >
                                        <option value="">Select fund…</option>
                                        {TUNISIAN_FUNDS.map(f => (
                                            <option key={f.slug} value={f.slug}>{f.label}</option>
                                        ))}
                                    </select>
                                    <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        type="button"
                                        aria-label="Remove fund"
                                        onClick={() => setPlacementDraft(d => d.filter((_, j) => j !== i))}
                                    >
                                        <IconX />
                                    </button>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                        Units held
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        placeholder="0"
                                        value={entry.units}
                                        onChange={e => setPlacementDraft(d => d.map((x, j) => j === i ? { ...x, units: e.target.value } : x))}
                                        style={{ flex: 1 }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        className="btn btn-sm btn-ghost mt-3"
                        type="button"
                        onClick={() => setPlacementDraft(d => [...d, { slug: '', label: '', units: '' }])}
                    >
                        <IconPlus /> Add another fund
                    </button>

                    <div className="flex-between mt-4">
                        <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={() => { setMode(null); setPlacementDraft(null); }}
                        >
                            <IconX /> Cancel
                        </button>
                        <div className="row-tight">
                            {goal.placement?.funds?.length > 0 && (
                                <button
                                    className="btn btn-danger btn-sm"
                                    type="button"
                                    onClick={() => {
                                        dispatch({ type: 'SET_GOAL_PLACEMENT', id: goal.id, placement: null });
                                        setMode(null); setPlacementDraft(null);
                                    }}
                                >
                                    Remove all
                                </button>
                            )}
                            <button
                                className="btn btn-primary btn-sm"
                                type="button"
                                onClick={() => {
                                    const funds = placementDraft
                                        .filter(f => f.slug && parseFloat(f.units) > 0)
                                        .map(f => ({ slug: f.slug, label: f.label, units: parseFloat(f.units) }));
                                    if (!funds.length) return;
                                    dispatch({ type: 'SET_GOAL_PLACEMENT', id: goal.id, placement: { funds } });
                                    setMode(null); setPlacementDraft(null);
                                    setTimeout(() => fetchAllNavs(funds), 50);
                                }}
                            >
                                <IconCheck /> Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default GoalCard;
