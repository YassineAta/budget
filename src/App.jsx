import { useState, useEffect, useRef } from 'react';
import { StoreProvider, useStore, listSnapshots, restoreSnapshot, exportToFile, importFromFile } from './store';
import Dashboard from './components/Dashboard';
import MonthlySpending from './components/MonthlySpending';
import GoalsList from './components/GoalsList';
import IncomeEvents from './components/IncomeEvents';
import {
    IconHome, IconWallet, IconTarget, IconBanknote,
    IconUpload, IconDownload, IconAlertTriangle,
    IconChevronDown, IconX, IconClock, IconBrain,
} from './components/icons';
import AIAdvisor from './components/AIAdvisor';

const TABS = [
    { id: 'dashboard', label: 'Home',   Icon: IconHome },
    { id: 'spending',  label: 'Spend',  Icon: IconWallet },
    { id: 'goals',     label: 'Goals',  Icon: IconTarget },
    { id: 'income',    label: 'Income', Icon: IconBanknote },
    { id: 'ai',        label: 'AI',     Icon: IconBrain },
];

function BackupButtons() {
    const fileInputRef = useRef(null);
    return (
        <>
            <button
                className="btn btn-sm btn-ghost"
                onClick={exportToFile}
                title="Download a JSON backup of all your data"
            >
                <IconDownload /> Export
            </button>
            <button
                className="btn btn-sm btn-ghost"
                onClick={() => fileInputRef.current?.click()}
                title="Restore data from a previously exported JSON backup"
            >
                <IconUpload /> Import
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

function SnapshotDropdown() {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const snapshots = listSnapshots();

    useEffect(() => {
        if (!open) return;
        const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onEsc);
        };
    }, [open]);

    if (snapshots.length === 0) return null;

    return (
        <div className="dropdown" ref={ref}>
            <button
                className="btn btn-sm btn-warning"
                onClick={() => setOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <IconClock /> Recover <IconChevronDown />
            </button>
            {open && (
                <div className="dropdown-menu" role="menu">
                    <div className="dropdown-menu-header">Restore a snapshot</div>
                    {snapshots.map(key => {
                        const label = key
                            .replace('finplan_v6_predmigration_', 'Pre-migration ')
                            .replace('finplan_v6_backup_', 'Daily backup ')
                            .replace(/T(\d{2})-(\d{2})-(\d{2})-\d+Z$/, ' $1:$2');
                        return (
                            <button
                                key={key}
                                role="menuitem"
                                className="dropdown-item"
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

function LoadErrorBanner({ error }) {
    const [dismissed, setDismissed] = useState(false);
    if (!error || dismissed) return null;

    return (
        <div className="load-error-banner" role="alert">
            <IconAlertTriangle />
            <span>
                <strong>Data load failed.</strong>{' '}
                Your saved data could not be loaded ({error.message}). Original data is still in storage — use Recover to restore it.
            </span>
            <SnapshotDropdown />
            <button
                className="btn btn-icon btn-ghost"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                style={{ color: '#fff' }}
            >
                <IconX />
            </button>
        </div>
    );
}

function AppContent() {
    const [tab, setTab] = useState('dashboard');
    const { dispatch, loadError } = useStore();

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

    function handleResetAll() {
        if (window.confirm('Erase all goals, income, and history? This cannot be undone.')) {
            localStorage.removeItem('finplan_v6');
            window.location.reload();
        }
    }

    return (
        <div className="app">
            <a href="#main" className="skip-link">Skip to content</a>

            <nav className="tab-bar" aria-label="Primary navigation">
                {TABS.map(t => {
                    const isActive = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            className={`tab-btn ${isActive ? 'active' : ''}`}
                            onClick={() => setTab(t.id)}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <t.Icon size={22} className="tab-icon" />
                            {t.label}
                        </button>
                    );
                })}
            </nav>

            <div className="app-content-area">
                <LoadErrorBanner error={loadError} />

                <header className="app-header">
                    <div className="app-brand">
                        <div className="app-brand-mark">
                            Fin<span className="accent">Plan</span>
                        </div>
                        <div className="app-tagline">Goal-Based Planner</div>
                    </div>

                    <div className="app-toolbar">
                        <SnapshotDropdown />
                        <BackupButtons />
                        <span className="flex-auto" />
                        <button
                            className="btn btn-sm btn-ghost"
                            onClick={handleResetAll}
                            style={{ color: 'var(--red)' }}
                        >
                            <IconAlertTriangle /> Reset
                        </button>
                    </div>
                </header>

                <main id="main">
                    {tab === 'dashboard' && <Dashboard onTabChange={setTab} />}
                    {tab === 'spending'  && <MonthlySpending />}
                    {tab === 'goals'     && <GoalsList />}
                    {tab === 'income'    && <IncomeEvents />}
                    {tab === 'ai'        && (
                        <div>
                            <div className="card-title mb-3"><IconBrain /> AI Financial Advisor</div>
                            <AIAdvisor />
                        </div>
                    )}
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
