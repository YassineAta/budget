import { useMemo } from 'react';
import { useStore } from '../store';

export default function DecisionHelper({ goal, amount, onClose, onConfirm }) {
    const { state } = useStore();
    const { goals, monthly, cash } = state;
    const cur = state.settings.currency;

    const warnings = useMemo(() => {
        const res = [];
        const bufferGoal = goals.find(g => g.isBuffer);

        // Check buffer safety
        if (bufferGoal && bufferGoal.saved < bufferGoal.target && !goal.isBuffer) {
            res.push({
                type: 'danger',
                icon: '🛡️',
                text: `Your safety buffer is ${(bufferGoal.target - bufferGoal.saved).toLocaleString()} ${cur} below target. Prioritise building your buffer first.`,
            });
        }

        // Check if enough cash
        if (amount > cash) {
            res.push({
                type: 'danger',
                icon: '🚨',
                text: `You don't have enough cash. Available: ${cash.toLocaleString()} ${cur}.`,
            });
        }

        // Check monthly spending
        const afterSpend = monthly.spent + amount;
        if (afterSpend > monthly.budget) {
            res.push({
                type: 'warning',
                icon: '📊',
                text: `Combined with monthly spending, this exceeds your ${monthly.budget.toLocaleString()} ${cur} budget.`,
            });
        }

        // Check priority
        if (goal.priority === 'Low') {
            res.push({
                type: 'warning',
                icon: '⬇️',
                text: `This is a low-priority goal. Consider funding higher-priority goals first.`,
            });
        }

        // Positive
        if (res.length === 0) {
            res.push({
                type: 'success',
                icon: '✅',
                text: `This allocation looks safe. Buffer is healthy and you're within budget.`,
            });
        }
        return res;
    }, [goal, amount, goals, monthly, cash, cur]);

    console.log(`🧠 Render: DecisionHelper - ${goal.name}`);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h3>🧠 Decision Helper</h3>
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{goal.name}</div>
                    <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                        Amount: {amount.toLocaleString()} {cur} · Priority: {goal.priority} · Cash: {cash.toLocaleString()} {cur}
                    </div>
                </div>
                {warnings.map((w, i) => (
                    <div key={i} className={`alert alert-${w.type}`}>
                        <span>{w.icon}</span>
                        <span>{w.text}</span>
                    </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                    {amount <= cash && (
                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onConfirm}>
                            Allocate {amount.toLocaleString()} {cur}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
