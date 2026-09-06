import { useState } from 'react';
import { useStore } from '../store';
import { computeAllocation } from '../utils/allocator';
import { getFutureEvents } from '../utils/cashflow';
import {
    IconBanknote, IconCalendar, IconBrain, IconRocket, IconPlus, IconTrash,
    IconArrowDown, IconShield, IconAlertTriangle, IconAlertOctagon, IconTarget,
    IconHeart, IconWallet,
} from './icons';

const DAY_MS = 86_400_000;

const TYPE_META = {
    survival:        { color: 'var(--yellow)', label: 'Survival needs',        Icon: IconWallet },
    buffer:          { color: 'var(--yellow)', label: 'Safety buffer',         Icon: IconShield },
    priority:        { color: 'var(--blue)',   label: 'Priority reserve',      Icon: IconTarget },
    urgent:          { color: 'var(--red)',    label: 'Urgent / overdue',     Icon: IconAlertOctagon },
    deadline:        { color: 'var(--blue)',   label: 'Deadline installment', Icon: IconCalendar },
    'high-priority': { color: 'var(--green)',  label: 'High priority',        Icon: IconTarget },
    'buffer-topup':  { color: 'var(--yellow)', label: 'Buffer top-up',        Icon: IconShield },
    'medium-priority': { color: 'var(--green)', label: 'Medium priority',     Icon: IconTarget },
    wishlist:        { color: 'var(--purple)', label: 'Wishlist',             Icon: IconHeart },
    'low-priority':  { color: 'var(--text-muted)', label: 'Low priority',     Icon: IconTarget },
};

export default function IncomeEvents() {
    const { state, dispatch } = useStore();
    const { incomeEvents, cash, settings } = state;
    const cur = settings.currency;

    const [source, setSource] = useState('');
    const [amount, setAmount] = useState('');
    const [draft, setDraft] = useState(null);

    const upcomingBills = getFutureEvents(state, 45).slice(0, 4);

    function handleSubmit(e) {
        e.preventDefault();
        const val = parseFloat(amount);
        if (!source.trim() || !val || val > 0 === false) return;
        const split = computeAllocation(state, val);
        setDraft({ source: source.trim(), amount: val, split });
    }

    function confirmAllocation() {
        if (!draft) return;
        dispatch({ type: 'ALLOCATE_INCOME', source: draft.source, amount: draft.amount });
        setDraft(null); setSource(''); setAmount('');
    }

    function quickAdd(e) {
        e.preventDefault();
        const val = parseFloat(amount);
        if (!source.trim() || !val || val <= 0) return;
        dispatch({ type: 'ADD_INCOME', source: source.trim(), amount: val });
        setSource(''); setAmount('');
    }

    return (
        <div>
            <div className="section-title"><IconBanknote /> Income Management</div>

            {cash > 0 && (
                <section className="card subtle">
                    <div className="card-title"><IconWallet /> Unallocated Cash</div>
                    <div className="card-value mono text-blue" style={{ fontSize: 'var(--text-2xl)' }}>
                        {cash.toLocaleString()} <span style={{ fontSize: '0.5em', opacity: 0.6 }}>{cur}</span>
                    </div>
                </section>
            )}

            {/* Upcoming bills */}
            {upcomingBills.length > 0 && (
                <section className="card subtle">
                    <div className="card-title"><IconCalendar /> Upcoming Bills · 45d</div>
                    <div className="stack">
                        {upcomingBills.map((ev, i) => {
                            const daysAway = Math.ceil((ev.date - new Date()) / DAY_MS);
                            const tone = daysAway <= 7 ? 'text-red' : daysAway <= 14 ? 'text-yellow' : 'text-muted';
                            return (
                                <div key={i} className="flex-between" style={{ fontSize: 'var(--text-sm)' }}>
                                    <span className={tone}>{ev.name}</span>
                                    <span className={`${tone} row-tight`}>
                                        <span className="mono" style={{ fontWeight: 700 }}>{ev.amount.toLocaleString()} {cur}</span>
                                        <span className="text-dim" style={{ fontWeight: 400, fontSize: 'var(--text-2xs)' }}>in {daysAway}d</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Income form */}
            {!draft && (
                <section className="card">
                    <div className="card-title"><IconArrowDown /> Log New Income</div>
                    <form onSubmit={handleSubmit}>
                        <div className="input-row">
                            <input
                                type="text"
                                placeholder="Source (e.g. Salary)"
                                value={source}
                                onChange={e => setSource(e.target.value)}
                            />
                            <input
                                type="number"
                                step="any"
                                placeholder="Amount"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                min="0"
                            />
                            <button className="btn btn-primary" type="submit">
                                <IconBrain /> Allocate
                            </button>
                        </div>
                    </form>
                    <div className="cluster mt-3">
                        {['Salary', 'Freelance', 'Refund', 'Bonus'].map(s => (
                            <button
                                key={s}
                                className="btn btn-sm btn-ghost"
                                onClick={() => setSource(s)}
                            >
                                {s}
                            </button>
                        ))}
                        <span className="flex-auto" />
                        <button className="btn btn-sm btn-ghost text-blue" onClick={quickAdd}>
                            <IconPlus /> Quick Add to Cash
                        </button>
                    </div>
                </section>
            )}

            {/* Allocation preview */}
            {draft && (
                <section className="card highlight">
                    <div className="card-title text-blue"><IconBrain /> Intelligent Allocation</div>
                    <div className="card-sub mb-3">
                        Received <strong className="mono text-green">{draft.amount.toLocaleString()} {cur}</strong> from <em>{draft.source}</em>
                    </div>

                    <div className="stack">
                        {draft.split.lines.map((line, i) => {
                            const meta = TYPE_META[line.type] || {};
                            const Icon = meta.Icon;
                            return (
                                <div className="list-item" key={i}>
                                    <div className="row" style={{ color: meta.color || 'inherit' }}>
                                        {Icon && <Icon />}
                                        <span>{line.label}</span>
                                    </div>
                                    <div className="list-item-amount" style={{ color: meta.color || 'inherit' }}>
                                        +{line.amount.toLocaleString()} {cur}
                                    </div>
                                </div>
                            );
                        })}
                        {draft.split.cashRemainder > 0 && (
                            <div className="list-item">
                                <div className="row">
                                    <IconWallet />
                                    <span>Remains as Free Cash</span>
                                </div>
                                <div className="list-item-amount">+{draft.split.cashRemainder.toLocaleString()} {cur}</div>
                            </div>
                        )}
                        {draft.split.lines.length === 0 && draft.split.cashRemainder > 0 && (
                            <div className="list-item">
                                <div className="row">
                                    <IconWallet />
                                    <span>All to Free Cash</span>
                                </div>
                                <div className="list-item-amount">+{draft.split.cashRemainder.toLocaleString()} {cur}</div>
                            </div>
                        )}
                    </div>

                    <div className="row mt-5">
                        <button className="btn btn-ghost flex-1" onClick={() => setDraft(null)}>Cancel</button>
                        <button className="btn btn-primary" style={{ flex: 2 }} onClick={confirmAllocation}>
                            <IconRocket /> Apply Split
                        </button>
                    </div>
                </section>
            )}

            {/* History */}
            <section className="card mt-5">
                <div className="card-title"><IconArrowDown /> Recent Income</div>
                {(!incomeEvents || incomeEvents.length === 0)
                    ? <div className="empty-state">No income logged yet</div>
                    : incomeEvents.slice(0, 10).map(inc => (
                        <div key={inc.id} className="list-item">
                            <div className="list-item-info">
                                <div className="list-item-name">{inc.source}</div>
                                <div className="list-item-meta">{new Date(inc.date).toLocaleDateString()}</div>
                            </div>
                            <div className="row">
                                <span className="text-green list-item-amount">+{inc.amount.toLocaleString()} {cur}</span>
                                <button
                                    className="btn btn-sm btn-ghost btn-icon"
                                    onClick={() => dispatch({ type: 'DELETE_INCOME', id: inc.id })}
                                    aria-label={`Delete ${inc.source} income`}
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
