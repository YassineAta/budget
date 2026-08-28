import { useState } from 'react';
import { useStore, monthlyEssentials } from '../store';
import ProgressBar from './ProgressBar';
import GoalCard from './GoalCard';
import { getRecommendation } from '../utils/financeAI';
import { projectBalance, normalizeToMonthly } from '../utils/cashflow';
import { getSeasonalRunoutDate } from '../utils/spendingInsights';
import {
    IconShield, IconShieldAlert, IconCheckCircle, IconAlertTriangle, IconAlertOctagon,
    IconCalendar, IconBrain, IconSparkles, IconArrowRight, IconCart, IconChart,
    IconPlus, IconMinus, IconTarget, IconRocket,
} from './icons';

const DAY_MS = 86_400_000;

function RunoutBadge({ state, cur }) {
    const buffer = state.goals?.find(g => g.isBuffer);
    if (!buffer || buffer.saved <= 0) {
        return (
            <div className="runout text-red">
                <IconShieldAlert />
                <span>Buffer depleted</span>
            </div>
        );
    }

    const expenses = state.monthly?.expenses || [];
    const declared = (state.monthly?.budget || 200) +
        (state.recurringExpenses || []).filter(e => e.active).reduce((s, e) => s + normalizeToMonthly(e), 0);
    const historicalSeasons = state.historicalSeasons || [];
    const growthRate = state.historicalGrowthRate ?? 0;
    const runout = getSeasonalRunoutDate(buffer.saved, expenses, declared, {
        historicalSeasons, growthRate,
    });
    const now = new Date();

    if (!runout) {
        const p12 = projectBalance(state, 365);
        return (
            <div className="runout text-green">
                <IconCheckCircle />
                <span>Runway &gt; 1 year</span>
                <span className="flex-auto runout-hint">12mo: <strong>{p12.toLocaleString()} {cur}</strong></span>
            </div>
        );
    }

    const daysLeft = Math.ceil((runout - now) / DAY_MS);
    const dateStr = runout.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const tone = daysLeft < 30 ? 'text-red' : daysLeft < 90 ? 'text-yellow' : 'text-blue';
    const Icon = daysLeft < 30 ? IconAlertOctagon : daysLeft < 90 ? IconAlertTriangle : IconCalendar;

    return (
        <div className={`runout ${tone}`}>
            <Icon />
            <span>Runs out in ~{daysLeft}d · <strong>{dateStr}</strong></span>
            <span className="flex-auto runout-hint">seasonal forecast</span>
        </div>
    );
}

export default function Dashboard({ onTabChange }) {
    const { state, dispatch } = useStore();
    const { cash, monthly, goals, safetyMonths, settings } = state;
    const cur = settings.currency;

    const [showRec, setShowRec] = useState(false);

    const bufferGoal = goals.find(g => g.isBuffer);
    const recurringExpenses = state.recurringExpenses || [];
    // Wishlist goals hold no reserved money, so they are excluded from allocated
    // and target totals (invariant: "no balance effect").
    const fundedGoals = goals.filter(g => g.type !== 'wishlist');
    const totalAllocated = fundedGoals.reduce((s, g) => s + g.saved, 0);
    const totalTargets = fundedGoals.reduce((s, g) => s + g.target, 0);
    const essentials = monthlyEssentials(state);

    const available = bufferGoal ? bufferGoal.saved : 0;
    const spentThisMonth = monthly.spent || 0;
    const remainingBudget = Math.min(available, Math.max(0, essentials - spentThisMonth));

    const months = safetyMonths || 3;
    // Single source of truth for the buffer target: the value the store already
    // computed onto the buffer goal (seasonal-aware). Do NOT recompute a rival
    // months×essentials figure here — that produced two disagreeing targets (#5).
    const bufferTarget = bufferGoal ? bufferGoal.target : months * essentials;
    const fundedMonths = essentials > 0 ? (available / essentials).toFixed(1) : '—';

    // Money genuinely put aside toward goals = everything saved outside the
    // safety buffer (which is survival money, not goal progress).
    const goalSavings = goals
        .filter(g => !g.isBuffer && g.type !== 'wishlist')
        .reduce((s, g) => s + g.saved, 0);

    const monthlyRecurring = recurringExpenses
        .filter(e => e.active)
        .reduce((s, e) => s + normalizeToMonthly(e), 0);

    const topGoals = goals
        .filter(g => !g.isBuffer && g.type !== 'wishlist' && g.saved < g.target)
        .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority]))
        .slice(0, 3);
    const readyGoals = goals.filter(g => !g.isBuffer && g.type !== 'wishlist' && g.saved >= g.target);

    const balanceColor = available < 50 ? 'text-red' : available < 150 ? 'text-yellow' : 'text-green';

    return (
        <div>
            {/* Safety Buffer */}
            <section className="card">
                <div className="flex-between mb-2">
                    <div className="card-title"><IconShield /> Safety Buffer</div>
                    <div className="stepper">
                        <span>Target</span>
                        <button
                            type="button"
                            onClick={() => dispatch({ type: 'SET_SAFETY_MONTHS', value: months - 1 })}
                            aria-label="Decrease target months"
                        >
                            <IconMinus />
                        </button>
                        <span className="stepper-value">{months}mo</span>
                        <button
                            type="button"
                            onClick={() => dispatch({ type: 'SET_SAFETY_MONTHS', value: months + 1 })}
                            aria-label="Increase target months"
                        >
                            <IconPlus />
                        </button>
                    </div>
                </div>

                <div className={`card-value ${balanceColor}`}>
                    {available.toLocaleString()} <span style={{ fontSize: '0.5em', opacity: 0.6 }}>{cur}</span>
                </div>

                <div className="mt-4">
                    <div className="progress-label">
                        <span>{fundedMonths} months funded</span>
                        <span className="mono">{bufferTarget.toLocaleString()} {cur}</span>
                    </div>
                    <ProgressBar
                        value={available}
                        max={bufferTarget || 1}
                        color={available >= bufferTarget ? 'green' : available / (bufferTarget || 1) > 0.6 ? 'yellow' : 'blue'}
                    />
                </div>

                <div className="mt-3">
                    <div className="progress-label">
                        <span>Monthly budget left</span>
                        <span className="mono">{remainingBudget} / {essentials} {cur}</span>
                    </div>
                    <ProgressBar
                        value={remainingBudget}
                        max={essentials || 1}
                        color={remainingBudget < 20 ? 'red' : remainingBudget < 100 ? 'yellow' : 'green'}
                    />
                </div>

                <RunoutBadge state={state} cur={cur} />
            </section>

            {/* Free cash callout */}
            {cash > 0 && (
                <div className="row mt-4" style={{ alignItems: 'stretch' }}>
                    <button
                        type="button"
                        className="alert alert-info flex-1"
                        style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
                        onClick={() => onTabChange('income')}
                    >
                        <IconBrain />
                        <span>
                            <strong>{cash.toLocaleString()} {cur}</strong> unallocated.{' '}
                            <span className="text-muted">Allocate it</span>
                        </span>
                        <IconArrowRight style={{ marginLeft: 'auto' }} />
                    </button>
                    <button
                        className="btn btn-blue"
                        onClick={() => setShowRec(s => !s)}
                        aria-expanded={showRec}
                    >
                        <IconSparkles /> AI
                    </button>
                </div>
            )}

            {showRec && cash > 0 && (
                <div className="card highlight mt-3">
                    <div className="card-title text-blue"><IconSparkles /> Smart Allocation</div>
                    <div className="card-sub mb-3">
                        Based on standard personal finance principles (safety first, deadlines, priority focus):
                    </div>
                    <div className="stack-3">
                        {getRecommendation(cash, goals, essentials, 12).map((rec, i) => (
                            <div key={i} className="card subtle" style={{ margin: 0, padding: 'var(--space-3)' }}>
                                <div className="flex-between mb-1">
                                    <strong>{rec.title}</strong>
                                    <strong className="text-blue mono">{rec.amount.toLocaleString()} {cur}</strong>
                                </div>
                                <div className="text-muted" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.45 }}>
                                    {rec.reason}
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="btn btn-outline mt-4 w-full" onClick={() => onTabChange('income')}>
                        Go to Allocation Wizard <IconArrowRight />
                    </button>
                </div>
            )}

            {/* Ready to Buy */}
            {readyGoals.length > 0 && (
                <>
                    <div className="section-title"><IconCart /> Ready to Buy</div>
                    <div className="goals-grid">
                        {readyGoals.map(goal => <GoalCard key={goal.id} goal={goal} compact />)}
                    </div>
                </>
            )}

            {/* Next Priorities */}
            {topGoals.length > 0 && (
                <>
                    <div className="section-title"><IconTarget /> Next Priorities</div>
                    <div className="goals-grid">
                        {topGoals.map(goal => <GoalCard key={goal.id} goal={goal} compact />)}
                    </div>
                </>
            )}

            {/* Monthly Breakdown */}
            <section className="card mt-4">
                <div className="card-title"><IconChart /> Monthly Breakdown</div>
                <div className="mini-grid">
                    <div className="mini-card">
                        <div className="label">Survival</div>
                        <div className="value">{monthly.budget} {cur}</div>
                    </div>
                    <div className="mini-card">
                        <div className="label">Recurring</div>
                        <div className="value">{Math.round(monthlyRecurring)} {cur}</div>
                    </div>
                    <div className="mini-card">
                        <div className="label">Total / mo</div>
                        <div className="value text-blue">{Math.round(essentials)} {cur}</div>
                    </div>
                </div>
            </section>

            {/* Net Goal Progress */}
            {totalTargets > 0 && (
                <section className="card subtle mt-5">
                    <div className="card-title"><IconRocket /> Net Goal Progress</div>
                    <div className="flex-between mb-2">
                        <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Saved toward goals</span>
                        <strong className="text-blue mono">
                            {goalSavings.toLocaleString()} {cur}
                        </strong>
                    </div>
                    <ProgressBar
                        value={totalAllocated}
                        max={totalTargets}
                        label={`${Math.round((totalAllocated / totalTargets) * 100)}% funded`}
                        color="blue"
                    />
                </section>
            )}
        </div>
    );
}
