import { useState } from 'react';
import { StoreProvider } from './store';
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
