import {
    ResponsiveContainer, BarChart, Bar, Cell, XAxis, Tooltip, ReferenceLine,
} from 'recharts';
import { getSpendingInsights } from '../utils/spendingInsights';
import {
    IconChart, IconBrain, IconAlertTriangle, IconArrowRight,
} from './icons';

// Hex values mirror the design tokens in index.css (SVG fills need concrete colors).
const C = {
    blue: '#6b8caf',
    green: '#5a8f6b',
    amber: '#c9883a',
    red: '#c46a6a',
    purple: '#9a7fb0',
    text: '#2a241e',
    muted: '#6b6055',
    border: '#e3d8c3',
    surface: '#fdfaf4',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortMonth(key) {
    const [, m] = key.split('-');
    return MONTHS[(parseInt(m, 10) || 1) - 1];
}

function ChartTooltip({ active, payload, cur }) {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload;
    return (
        <div
            style={{
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: '6px 10px', fontSize: '0.76rem', color: C.text, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
        >
            <strong>{shortMonth(p.month)}</strong> · {Math.round(p.total).toLocaleString()} {cur}
            {p.isCurrent && <span style={{ color: C.muted }}> (so far)</span>}
        </div>
    );
}

export default function SpendingInsights({ state, asOf = new Date() }) {
    const cur = state.settings?.currency || '';
    const ins = getSpendingInsights(state, asOf);
    const currentKey = new Date(asOf).toISOString().slice(0, 7);

    if (!ins.hasHistory) {
        return (
            <section className="card subtle">
                <div className="card-title"><IconBrain /> Spending Insights</div>
                <div className="empty-state">
                    Log a few expenses and your monthly trend, averages, and behaviour signals will appear here.
                </div>
            </section>
        );
    }

    const data = ins.series.map(s => ({ ...s, isCurrent: s.month === currentKey }));
    const avg = ins.learnedBurn;
    const { pace, mom, categories, anomalies } = ins;

    const paceTone = pace.status === 'above' ? 'text-red' : pace.status === 'below' ? 'text-green' : 'text-blue';
    const paceLabel = pace.status === 'above'
        ? `${Math.abs(pace.pct)}% above your usual pace`
        : pace.status === 'below'
            ? `${Math.abs(pace.pct)}% below your usual pace`
            : pace.status === 'on_track'
                ? 'right on your usual pace'
                : 'building your baseline';

    const maxCat = categories.length ? categories[0].total : 1;

    return (
        <section className="card">
            <div className="card-title"><IconChart /> Spending Insights</div>

            {/* Headline stats */}
            <div className="mini-grid mb-3">
                <div className="mini-card">
                    <div className="label">This month</div>
                    <div className="value">{Math.round(pace.spentThisMonth).toLocaleString()} {cur}</div>
                </div>
                <div className="mini-card">
                    <div className="label">3-mo average</div>
                    <div className="value">{avg != null ? Math.round(avg).toLocaleString() : '—'} {cur}</div>
                </div>
                <div className="mini-card">
                    <div className="label">Proj. month-end</div>
                    <div className={`value ${paceTone}`}>{Math.round(pace.projectedMonthEnd).toLocaleString()} {cur}</div>
                </div>
            </div>

            {/* Behaviour signal */}
            {pace.status !== 'unknown' && (
                <div className={`alert ${pace.status === 'above' ? 'alert-danger' : 'alert-info'} mb-3`}>
                    <IconBrain />
                    <span>
                        At this rate you're <strong className={paceTone}>{paceLabel}</strong>.
                        {mom && mom.pct != null && (
                            <> Last month you spent {Math.round(mom.previous).toLocaleString()} {cur}
                                {' '}({mom.delta >= 0 ? '+' : ''}{mom.pct}% vs the month before).</>
                        )}
                    </span>
                </div>
            )}

            {/* Month-over-month chart */}
            <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer>
                    <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                        <XAxis
                            dataKey="month"
                            tickFormatter={shortMonth}
                            tick={{ fill: C.muted, fontSize: 12 }}
                            axisLine={{ stroke: C.border }}
                            tickLine={false}
                        />
                        <Tooltip
                            cursor={{ fill: 'rgba(107,140,175,0.08)' }}
                            content={<ChartTooltip cur={cur} />}
                        />
                        {avg != null && (
                            <ReferenceLine
                                y={avg}
                                stroke={C.purple}
                                strokeDasharray="4 4"
                                strokeWidth={1.5}
                                label={{ value: `avg ${Math.round(avg)}`, position: 'insideTopRight', fill: C.purple, fontSize: 11 }}
                            />
                        )}
                        <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={44}>
                            {data.map((d, i) => (
                                <Cell
                                    key={i}
                                    fill={d.isCurrent ? (pace.status === 'above' ? C.amber : C.green) : C.blue}
                                    fillOpacity={d.isCurrent ? 1 : 0.55}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Category breakdown */}
            {categories.length > 0 && (
                <div className="mt-4">
                    <div className="card-sub" style={{ marginBottom: 8 }}>Where it went this month</div>
                    <div className="stack-3">
                        {categories.slice(0, 5).map(c => (
                            <div key={c.category} className="row" style={{ alignItems: 'center', gap: 10 }}>
                                <span style={{ minWidth: 78, fontSize: 'var(--text-sm)' }}>{c.category}</span>
                                <div className="progress-track" style={{ flex: 1 }}>
                                    <div
                                        className="progress-fill blue"
                                        style={{ width: `${Math.max(4, (c.total / maxCat) * 100)}%` }}
                                    />
                                </div>
                                <span className="mono" style={{ minWidth: 60, textAlign: 'right', fontSize: 'var(--text-sm)' }}>
                                    {Math.round(c.total).toLocaleString()} {cur}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Anomaly flags */}
            {anomalies.length > 0 && (
                <div className="mt-4">
                    <div className="card-sub" style={{ marginBottom: 8 }}>Worth a look</div>
                    <div className="cluster">
                        {anomalies.slice(0, 4).map(a => (
                            <span
                                key={a.category}
                                className={`chip ${a.direction === 'up' ? 'chip-warn' : 'chip-good'}`}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    fontSize: 'var(--text-xs)', padding: '4px 10px', borderRadius: 'var(--radius-pill)',
                                    background: a.direction === 'up' ? 'var(--red-soft)' : 'var(--green-soft)',
                                    color: a.direction === 'up' ? 'var(--red)' : 'var(--green)',
                                    border: `1px solid ${a.direction === 'up' ? 'var(--red)' : 'var(--green)'}`,
                                }}
                            >
                                {a.direction === 'up' ? <IconAlertTriangle size={12} /> : <IconArrowRight size={12} style={{ transform: 'rotate(45deg)' }} />}
                                {a.category} {a.direction === 'up' ? '+' : ''}{a.pct}%
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
