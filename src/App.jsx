import { useState, useEffect } from 'react';
import { StoreProvider, useStore } from './store';
import Dashboard from './components/Dashboard';
import MonthlySpending from './components/MonthlySpending';
import GoalsList from './components/GoalsList';
import IncomeEvents from './components/IncomeEvents';

const TABS = [
    { id: 'dashboard', label: 'Home', icon: '📊' },
    { id: 'spending', label: 'Spend', icon: '💳' },
    { id: 'goals', label: 'Goals', icon: '🎯' },
    { id: 'income', label: 'Income', icon: '💵' },
];

function AppContent() {
    const [tab, setTab] = useState('dashboard');
    const { dispatch } = useStore();

    // Re-apply cashflow whenever the user returns to the app so the balance
    // stays current even after leaving the tab/window for a while.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                dispatch({ type: 'APPLY_CASHFLOW' });
            }
        };
        const onFocus = () => dispatch({ type: 'APPLY_CASHFLOW' });
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onFocus);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onFocus);
        };
    }, [dispatch]);

    return (
        <div className="app">
            <nav className="tab-bar">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        className={`tab-btn ${tab === t.id ? 'active' : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        <span className="tab-icon">{t.icon}</span>
                        {t.label}
                    </button>
                ))}
            </nav>

            <div className="app-content-area">
                <header className="app-header">
                    <h1>FinPlan</h1>
                    <div className="subtitle">Goal-Based Saving Planner</div>
                    <button 
                        className="btn btn-sm btn-ghost" 
                        style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 12 }}
                        onClick={() => {
                            if (window.confirm("Are you sure you want to erase all goals, income, and history? This cannot be undone.")) {
                                localStorage.removeItem('finplan_v6');
                                window.location.reload();
                            }
                        }}
                    >
                        ⚠️ Reset All App Data
                    </button>
                </header>

                <main style={{ paddingTop: 8 }}>
                    {tab === 'dashboard' && <Dashboard onTabChange={setTab} />}
                    {tab === 'spending' && <MonthlySpending />}
                    {tab === 'goals' && <GoalsList />}
                    {tab === 'income' && <IncomeEvents />}
                </main>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <StoreProvider>
            <AppContent />
        </StoreProvider>
    );
}
