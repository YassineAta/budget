import { getSpendingInsights, getSeasonalRunoutDate } from './spendingInsights';

/** Builds the financial snapshot injected into every prompt. */
export function buildContext(state) {
  const cur = state.settings?.currency || 'TND';
  const expenses = state.monthly?.expenses || [];
  const insights = getSpendingInsights(state);
  const buf = state.goals?.find(g => g.isBuffer);

  const runout = buf
    ? getSeasonalRunoutDate(buf.saved, expenses, state.monthly?.budget || 0, {
        historicalSeasons: state.historicalSeasons || [],
        growthRate: state.historicalGrowthRate || 0,
      })
    : null;

  const goalLines = (state.goals || [])
    .map(g => {
      const pct = g.target > 0 ? Math.round((g.saved / g.target) * 100) : 100;
      const tags = [g.priority, g.isBuffer && 'Buffer', g.isPriority && 'Priority Reserve']
        .filter(Boolean).join(', ');
      return `• ${g.name}: ${g.saved.toLocaleString()}/${g.target.toLocaleString()} ${cur} (${pct}%) [${tags}]`;
    })
    .join('\n');

  const recurringLines = (state.recurringExpenses || [])
    .filter(e => e.active)
    .map(e => `• ${e.name}: ${e.amount} ${cur}/${e.period}`)
    .join('\n') || '• None';

  const anomalyLines = insights.anomalies?.length
    ? insights.anomalies.map(a => `• ${a.category}: ${a.pct > 0 ? '+' : ''}${a.pct}% vs avg`).join('\n')
    : '• None this month';

  const profile = state.aiProfile?.priorities
    ? `\nCONFIRMED PRIORITIES PROFILE:\n${state.aiProfile.priorities}`
    : '\nPRIORITIES PROFILE: Not yet generated.';

  return `FINANCIAL SNAPSHOT — ${new Date().toLocaleDateString('en-GB')}
Cash on hand: ${(state.cash || 0).toLocaleString()} ${cur}
Monthly budget: ${state.monthly?.budget || 0} ${cur} | Spent: ${(state.monthly?.spent || 0).toLocaleString()} ${cur} | Remaining: ${Math.max(0, (state.monthly?.budget || 0) - (state.monthly?.spent || 0)).toLocaleString()} ${cur}

GOALS:
${goalLines || '• None'}

ACTIVE RECURRING EXPENSES:
${recurringLines}

ANALYTICS:
• Weighted monthly burn: ${insights.weightedBurn?.toLocaleString() ?? 'insufficient data'} ${cur}
• Pace this month: ${insights.pace?.status ?? 'unknown'} (${insights.pace?.pct != null ? (insights.pace.pct > 0 ? '+' : '') + insights.pace.pct + '%' : 'N/A'} vs baseline)
• Buffer runway: ${runout ? runout.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'beyond 2 years'}

SPENDING ANOMALIES:
${anomalyLines}
${profile}`;
}

export function systemPrompt(state) {
  const cur = state.settings?.currency || 'TND';
  return `You are a sharp, embedded personal financial advisor inside FinPlan. Currency: ${cur}.

You have full access to the user's real-time financial data below. Be specific, actionable, and direct — use their actual goal names and amounts, never generic tips. When you spot a risk or opportunity, name the exact figure.

${buildContext(state)}`;
}

export function prioritiesPrompt(state) {
  return `Analyse this user's financial data and write a 4–6 sentence "priorities profile" in second person (you…) that captures:
1. What they clearly value most, based on which goals they've funded and at what level
2. Their apparent risk tolerance, inferred from their buffer level and spending patterns
3. A spending pattern or habit that reveals something about their priorities
4. One concrete, specific action that is the highest-leverage financial move for them right now

Be precise and grounded in their actual numbers — no generic advice. This profile will be injected into every future AI conversation to personalise recommendations.

${buildContext(state)}`;
}

export function monthlyReviewPrompt(state) {
  return `Write a concise monthly financial review covering:
1. How this month's spending pace compares to the learned baseline (use the exact percentage)
2. Which goals are on track and which are falling behind (reference their names and current percentages)
3. The single most important action to take this month, with a specific amount if applicable
4. One forward-looking risk or opportunity given the buffer runway date

Keep it under 250 words. Be direct and use the actual numbers.

${buildContext(state)}`;
}
