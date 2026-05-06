/**
 * S7 — Rapid React state churn.
 *
 * Verifies that dispatching many actions in rapid succession (within a single
 * React commit cycle or across multiple) does not cause:
 *   - crashes
 *   - incorrect final state
 *   - unexpected double-application of cashflow
 *
 * Also verifies StrictMode double-invocation does not corrupt state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { StoreProvider, useStore } from '../../store';

beforeEach(() => vi.useFakeTimers({ now: new Date(Date.UTC(2026, 3, 11, 12, 0, 0)) }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeInitialState(cashBalance = 0) {
  return {
    schemaVersion: 6,
    cash: cashBalance,
    monthly: { budget: 200, spent: 0, expenses: [], resetDate: '2026-04' },
    safetyMonths: 3,
    goals: [{ id: 'buffer', name: 'Safety Buffer', target: 600, saved: 5000, isBuffer: true, type: 'saving' }],
    recurringExpenses: [],
    incomeEvents: [],
    settings: { currency: 'TND' },
  };
}

describe('[S7] Rapid React state churn', () => {
  it('100 ADD_INCOME dispatches sum correctly', async () => {
    localStorage.setItem('finplan_v6', JSON.stringify(makeInitialState(0)));

    let capturedCash = null;
    let capturedDispatch = null;

    function Reader() {
      const { state, dispatch } = useStore();
      capturedCash = state.cash;
      capturedDispatch = dispatch;
      return null;
    }

    await act(async () => {
      render(<StoreProvider><Reader /></StoreProvider>);
    });

    // Dispatch 100 ADD_INCOME actions
    await act(async () => {
      for (let i = 0; i < 100; i++) {
        capturedDispatch({ type: 'ADD_INCOME', amount: 10, source: 'Test' });
      }
    });

    expect(capturedCash).toBe(1000); // 100 × 10
  });

  it('100 APPLY_CASHFLOW dispatches are idempotent (no double-drain)', async () => {
    const state = makeInitialState(0);
    state.recurringExpenses = [{
      id: 'gym', name: 'Gym', amount: 70, period: 'monthly', cut_day: 1,
      start_date: '2026-04-05T00:00:00.000Z',
      last_applied_date: '2026-04-01T00:00:00.000Z',
      active: true,
    }];
    state.goals[0].saved = 930;
    state.monthly.spent = 70;
    state.monthly.expenses = [{ id: 'e1', name: 'Gym', amount: 70, date: '2026-04-01T00:00:00.000Z', isRecurring: true, recurringId: 'gym' }];
    localStorage.setItem('finplan_v6', JSON.stringify(state));

    let capturedBuf = null;
    let capturedDispatch = null;

    function Reader() {
      const { state: s, dispatch } = useStore();
      capturedBuf = s.goals?.find(g => g.isBuffer)?.saved ?? null;
      capturedDispatch = dispatch;
      return null;
    }

    await act(async () => {
      render(<StoreProvider><Reader /></StoreProvider>);
    });

    expect(capturedBuf).toBe(930); // no pending cuts

    // Fire 100 APPLY_CASHFLOW dispatches — all idempotent (no pending cuts)
    await act(async () => {
      for (let i = 0; i < 100; i++) {
        capturedDispatch({ type: 'APPLY_CASHFLOW' });
      }
    });

    expect(capturedBuf).toBe(930); // unchanged
  });

  it('StrictMode double-invocation: 50 ADD_INCOME dispatches still net correct', async () => {
    const { StrictMode } = await import('react');
    localStorage.setItem('finplan_v6', JSON.stringify(makeInitialState(0)));

    let capturedCash = null;
    let capturedDispatch = null;

    function Reader() {
      const { state, dispatch } = useStore();
      capturedCash = state.cash;
      capturedDispatch = dispatch;
      return null;
    }

    await act(async () => {
      render(
        <StrictMode>
          <StoreProvider><Reader /></StoreProvider>
        </StrictMode>
      );
    });

    await act(async () => {
      for (let i = 0; i < 50; i++) {
        capturedDispatch({ type: 'ADD_INCOME', amount: 1, source: 'Test' });
      }
    });

    expect(capturedCash).toBe(50);
  });

  it('interleaved ADD_INCOME and ADD_EXPENSE stay consistent', async () => {
    // ADD_INCOME adds to cash; ADD_EXPENSE drains the buffer + monthly.spent (not cash).
    localStorage.setItem('finplan_v6', JSON.stringify(makeInitialState(500)));

    let capturedState = null;
    let capturedDispatch = null;

    function Reader() {
      const { state, dispatch } = useStore();
      capturedState = state;
      capturedDispatch = dispatch;
      return null;
    }

    await act(async () => {
      render(<StoreProvider><Reader /></StoreProvider>);
    });

    await act(async () => {
      for (let i = 0; i < 10; i++) {
        capturedDispatch({ type: 'ADD_INCOME', amount: 100, source: 'Batch' });
        capturedDispatch({ type: 'ADD_EXPENSE', amount: 50, name: 'Coffee' });
      }
    });

    // cash: 500 + 10*100 = 1500 (ADD_EXPENSE does not touch cash)
    expect(capturedState.cash).toBe(1500);
    // monthly.spent: 0 + 10*50 = 500
    expect(capturedState.monthly.spent).toBe(500);
    // 10 expense entries logged
    expect(capturedState.monthly.expenses.length).toBe(10);
    // buffer drained by 10*50 = 500; initial buffer=5000 → 4500
    const buf = capturedState.goals.find(g => g.isBuffer);
    expect(buf.saved).toBe(4500);
  });
});
