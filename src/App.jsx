import { useState, useEffect, useRef } from 'react';
import { StoreProvider, useStore, listSnapshots, restoreSnapshot, exportToFile, importFromFile } from './store';
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

// ─── Backup export / import buttons ───────────────────────────────────────────
function BackupButtons() {
    const fileInputRef = useRef(null);
    return (
        <>
            <button
                className="btn btn-sm btn-ghost"
                style={{ fontSize: '0.7rem' }}
                onClick={exportToFile}
                title="Download a JSON backup of all your data"
            >
                📤 Export
            </button>
            <button
                className="btn btn-sm btn-ghost"
                style={{ fontSize: '0.7rem' }}
                onClick={() => fileInputRef.current?.click()}
                title="Restore data from a previously exported JSON backup"
            >
                📥 Import
            </button>
            <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) importFromFile(file).catch(() => {});
                    e.target.value = '';
                }}
            />
        </>
    );
}

// ─── Snapshot restore dropdown ────────────────────────────────────────────────
function SnapshotDropdown() {
    const [open, setOpen] = useState(false);
    const snapshots = listSnapshots();

    if (snapshots.length === 0) return null;

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
                className="btn btn-sm"
                style={{ background: 'var(--yellow, #f59e0b)', color: '#000', fontSize: '0.75rem' }}
                onClick={() => setOpen(o => !o)}
            >
                Recover Data ▾
            </button>
            {open && (
                <div style={{
                    position: 'absolute', right: 0, top: '110%', zIndex: 100,
                    background: 'var(--surface, #1e1e2e)', border: '1px solid var(--border, #444)',
                    borderRadius: 8, minWidth: 260, padding: '8px 0', boxShadow: '0 4px 16px rgba(0,0,0,.4)'
                }}>
                    <div style={{ padding: '4px 12px 8px', fontSize: '0.7rem', color: 'var(--muted, #888)', borderBottom: '1px solid var(--border, #444)', marginBottom: 4 }}>
                        Select a snapshot to restore:
                    </div>
                    {snapshots.map(key => {
                        const label = key
                            .replace('finplan_v6_predmigration_', 'Pre-migration ')
                            .replace('finplan_v6_backup_', 'Daily backup ')
                            .replace(/T(\d{2})-(\d{2})-(\d{2})-\d+Z$/, ' $1:$2');
                        return (
                            <button
                                key={key}
                                style={{
                                    display: 'block', width: '100%', textAlign: 'left',
                                    background: 'none', border: 'none', color: 'inherit',
                                    padding: '6px 12px', fontSize: '0.75rem', cursor: 'pointer',
                                }}
                                onClick={() => {
                                    setOpen(false);
                                    if (window.confirm(`Restore snapshot "${label}"?\n\nThis will overwrite your current data. Make sure you want to do this.`)) {
                                        restoreSnapshot(key);
                                    }
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Load-error banner ────────────────────────────────────────────────────────
function LoadErrorBanner({ error }) {
    const [dismissed, setDismissed] = useState(false);
    if (!error || dismissed) return null;

    return (
        <div style={{
            background: 'var(--red, #ef4444)', color: '#fff',
            padding: '8px 16px', fontSize: '0.8rem', display: 'flex',
            alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
            <strong>⚠ Data load failed</strong>
            <span style={{ flex: 1 }}>
                Your saved data could not be loaded ({error.message}). Your original data is still in storage — use Recover Data to restore it.
            </span>
            <SnapshotDropdown />
            <button
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem', padding: 0 }}
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
            >✕</button>
        </div>
    );
}

function AppContent() {
    const [tab, setTab] = useState('dashboard');
    const { dispatch, loadError } = useStore();

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
            <LoadErrorBanner error={loadError} />

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
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                        <SnapshotDropdown />
                        <BackupButtons />
                        <button
                            className="btn btn-sm btn-ghost"
                            style={{ color: 'var(--red)', fontSize: '0.7rem' }}
                            onClick={() => {
                                if (window.confirm("Are you sure you want to erase all goals, income, and history? This cannot be undone.")) {
                                    localStorage.removeItem('finplan_v6');
                                    window.location.reload();
                                }
                            }}
                        >
                            ⚠️ Reset All App Data
                        </button>
                    </div>
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
