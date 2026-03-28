import { useState } from 'react';
import { useStore } from '../store';
import { computeAllocation } from '../utils/allocator';
import { getFutureEvents } from '../utils/cashflow';

const TYPE_STYLES = {
  survival:      { color: 'var(--yellow)', label: 'Survival needs' },
  urgent:        { color: 'var(--red)',    label: 'Urgent / overdue' },
  deadline:      { color: 'var(--blue)',   label: 'Deadline installment' },
  'high-priority': { color: 'var(--green)', label: 'High priority' },
  'buffer-topup':  { color: 'var(--yellow)', label: 'Buffer top-up' },
  'medium-priority': { color: 'var(--green)', label: 'Medium priority' },
  wishlist:      { color: '#a78bfa',       label: 'Wishlist' },
  'low-priority':  { color: 'rgba(255,255,255,0.5)', label: 'Low priority' },
};

export default function IncomeEvents() {
    const { state, dispatch } = useStore();
    const { incomeEvents, cash, settings } = state;
    const cur = settings.currency;

    const [source, setSource] = useState('');
    const [amount, setAmount] = useState('');
    const [draft, setDraft] = useState(null);

    // Next 3 upcoming bill cuts
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
            <div className="section-title">💵 Income Management</div>

            {cash > 0 && (
                <div className="card" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
                    <div style={{ display: 'flex', gap: 24 }}>
                        <div>
                            <div className="label" style={{ fontSize: '0.65rem' }}>UNALLOCATED CASH</div>
                            <div className="value text-blue" style={{ fontSize: '1.1rem', fontWeight: 800 }}>{cash.toLocaleString()} {cur}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Upcoming bills */}
            {upcomingBills.length > 0 && (
                <div className="card mt-12" style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.15)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Upcoming bills (next 45d)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {upcomingBills.map((ev, i) => {
                            const daysAway = Math.ceil((ev.date - new Date()) / 86_400_000);
                            const color = daysAway <= 7 ? 'var(--red)' : daysAway <= 14 ? 'var(--yellow)' : 'rgba(255,255,255,0.6)';
                            return (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                                    <span style={{ color }}>{ev.name}</span>
                                    <span style={{ color, fontWeight: 600 }}>
                                        {ev.amount.toLocaleString()} {cur}
                                        <span style={{ opacity: 0.6, fontWeight: 400, marginLeft: 6 }}>in {daysAway}d</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Income Form */}
            {!draft && (
                <div className="card mt-12">
                    <div className="card-title">Log New Income</div>
                    <form onSubmit={handleSubmit}>
                        <div className="input-row">
                            <input type="text" placeholder="Source (e.g. Salary)" value={source} onChange={e => setSource(e.target.value)} />
                            <input type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} min="0" />
                            <button className="btn btn-primary" type="submit">Allocate</button>
                        </div>
                    </form>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        {['Salary', 'Freelance', 'Refund', 'Bonus'].map(s => (
                            <button key={s} className="btn btn-sm btn-ghost" onClick={() => setSource(s)} style={{ fontSize: '0.7rem' }}>{s}</button>
                        ))}
                        <span style={{ opacity: 0.3, fontSize: '0.7rem', marginLeft: 'auto' }}>or</span>
                        <button className="btn btn-sm btn-ghost" onClick={quickAdd} style={{ fontSize: '0.7rem', color: 'var(--blue)' }}>Quick Add to Cash</button>
                    </div>
                </div>
            )}

            {/* Allocation Preview */}
            {draft && (
                <div className="card" style={{ border: '2px solid var(--blue)' }}>
                    <div className="card-title"><span className="icon">🧠</span> Intelligent Allocation</div>
                    <div className="card-sub mb-12">
                        Received <strong>{draft.amount.toLocaleString()} {cur}</strong> from <em>{draft.source}</em>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {draft.split.lines.map((line, i) => {
                            const style = TYPE_STYLES[line.type] || {};
                            return (
                                <div className="list-item" key={i}>
                                    <div style={{ color: style.color }}>
                                        {line.icon} {line.label}
                                    </div>
                                    <div style={{ fontWeight: 700, color: style.color }}>
                                        +{line.amount.toLocaleString()} {cur}
                                    </div>
                                </div>
                            );
                        })}
                        {draft.split.cashRemainder > 0 && (
                            <div className="list-item" style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: 8, marginTop: 2 }}>
                                <div>💰 Remains as Free Cash</div>
                                <div style={{ fontWeight: 700 }}>+{draft.split.cashRemainder.toLocaleString()} {cur}</div>
                            </div>
                        )}
                        {draft.split.lines.length === 0 && draft.split.cashRemainder > 0 && (
                            <div className="list-item">
                                <div>💰 All to Free Cash</div>
                                <div style={{ fontWeight: 700 }}>+{draft.split.cashRemainder.toLocaleString()} {cur}</div>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setDraft(null)}>Cancel</button>
                        <button className="btn btn-primary" style={{ flex: 2 }} onClick={confirmAllocation}>Apply Split 🚀</button>
                    </div>
                </div>
            )}

            {/* History */}
            <div className="card mt-24">
                <div className="card-title">Recent Income</div>
                {(!incomeEvents || incomeEvents.length === 0)
                    ? <div className="empty-state">No income logged yet</div>
                    : incomeEvents.slice(0, 10).map(inc => (
                        <div key={inc.id} className="list-item">
                            <div className="list-item-info">
                                <div className="list-item-name">{inc.source}</div>
                                <div className="list-item-meta">{new Date(inc.date).toLocaleDateString()}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span className="text-green" style={{ fontWeight: 700 }}>+{inc.amount.toLocaleString()} {cur}</span>
                                <button
                                    className="btn btn-sm btn-danger"
                                    onClick={() => dispatch({ type: 'DELETE_INCOME', id: inc.id })}
                                    aria-label={`Delete ${inc.source} income`}
                                    style={{ padding: '4px 8px', fontSize: '0.65rem' }}
                                >✕</button>
                            </div>
                        </div>
                    ))
                }
            </div>
        </div>
    );
}
