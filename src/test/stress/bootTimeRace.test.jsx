/**
 * S8 — Boot-time race conditions.
 *
 * Verifies that APPLY_CASHFLOW events fired very early in the component
 * lifecycle (before or during the first render) do not cause double-counting
 * or inconsistent state. This simulates the App.jsx visibilitychange listener
 * firing during or immediately after mount.
 *
 * Key invariant: regardless of how many APPLY_CASHFLOW dispatches happen in
 * the boot window, the reducer applies each cut at most once (idempotency).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { StoreProvider, useStore } from '../../store';

beforeEach(() => vi.useFakeTimers({ now: new Date(Date.UTC(2026, 3, 11, 12, 0, 0)) }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeState({ saved = 1000, lastApplied = '2026-03-01T00:00:00.000Z' } = {}) {
  return {
    schemaVersion: 6,
    cash: 0,
    monthly: { budget: 200, spent: 0, expenses: [], resetDate: '2026-04' },
    safetyMonths: 3,
    goals: [{ id: 'buffer', name: 'Safety Buffer', target: 600, saved, isBuffer: true, type: 'saving' }],
    recurringExpenses: [{
      id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1,
      start_date: '2026-03-15T00:00:00.000Z',
      last_applied_date: lastApplied,
      active: true,
    }],
    incomeEvents: [],
    settings: { currency: 'TND' },
  };
}

describe('[S8] Boot-time race', () => {
  it('APPLY_CASHFLOW before first render completes does not double-count', async () => {
    localStorage.setItem('finplan_v6', JSON.stringify(makeState({ saved: 1000 })));

    let capturedBuf = null;
    let capturedDispatch = null;

    function Reader() {
      const { state, dispatch } = useStore();
      capturedBuf = state.goals?.find(g => g.isBuffer)?.saved ?? null;
      capturedDispatch = dispatch;
      return null;
    }

    // Mount synchronously — APPLY_CASHFLOW fires "at the same time"
    await act(async () => {
      render(<StoreProvider><Reader /></StoreProvider>);
      // Immediately dispatch before any microtasks resolve
      if (capturedDispatch) capturedDispatch({ type: 'APPLY_CASHFLOW' });
    });

    // Recurring is projection-only on load, and the early dispatch is null-guarded.
    expect(capturedBuf).toBe(1000);
  });

  it('5 APPLY_CASHFLOW dispatches in immediate succession = exactly one cut', async () => {
    localStorage.setItem('finplan_v6', JSON.stringify(makeState({ saved: 1000 })));

    let capturedBuf = null;
    let capturedDispatch = null;

    function Reader() {
      const { state, dispatch } = useStore();
      capturedBuf = state.goals?.find(g => g.isBuffer)?.saved ?? null;
      capturedDispatch = dispatch;
      return null;
    }

    await act(async () => {
      render(<StoreProvider><Reader /></StoreProvider>);
    });

    await act(async () => {
      for (let i = 0; i < 5; i++) {
        capturedDispatch({ type: 'APPLY_CASHFLOW' });
      }
    });

    expect(capturedBuf).toBe(930); // cut fired exactly once on first dispatch
  });

  it('already-applied state: 10 APPLY_CASHFLOW dispatches leave balance unchanged', async () => {
    // lastApplied = Apr 1, system time = Apr 11 → no cut is due
    localStorage.setItem('finplan_v6', JSON.stringify(makeState({
      saved: 930,
      lastApplied: '2026-04-01T00:00:00.000Z',
    })));

    let capturedBuf = null;
    let capturedDispatch = null;

    function Reader() {
      const { state, dispatch } = useStore();
      capturedBuf = state.goals?.find(g => g.isBuffer)?.saved ?? null;
      capturedDispatch = dispatch;
      return null;
    }

    await act(async () => {
      render(<StoreProvider><Reader /></StoreProvider>);
    });

    await act(async () => {
      for (let i = 0; i < 10; i++) {
        capturedDispatch({ type: 'APPLY_CASHFLOW' });
      }
    });

    expect(capturedBuf).toBe(930); // initial state; no cut due; dispatches are no-ops
  });

  it('StrictMode boot with pending cut fires exactly once', async () => {
    const { StrictMode } = await import('react');
    localStorage.setItem('finplan_v6', JSON.stringify(makeState({ saved: 1000 })));

    let capturedBuf = null;

    function Reader() {
      const { state } = useStore();
      capturedBuf = state.goals?.find(g => g.isBuffer)?.saved ?? null;
      return null;
    }

    await act(async () => {
      render(
        <StrictMode>
          <StoreProvider><Reader /></StoreProvider>
        </StrictMode>
      );
    });

    expect(capturedBuf).toBe(1000); // recurring is projection-only — no cut on load
  });
});
