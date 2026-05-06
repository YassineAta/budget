/**
 * S4 — Quota exhaustion: localStorage.setItem throws QuotaExceededError.
 *
 * Verifies:
 * - loadState still succeeds (reads unaffected)
 * - StoreProvider mounts without crashing
 * - A dispatched ADD_INCOME updates React state cleanly
 * - A console.warn is emitted on save failure
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { StoreProvider, useStore, loadState } from '../../store';

beforeEach(() => vi.useFakeTimers({ now: new Date(2026, 3, 11, 12, 0, 0) }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('[S4] Quota exhaustion', () => {
  it('StoreProvider mounts without crashing when setItem throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    await expect(act(async () => {
      render(
        <StoreProvider>
          <div data-testid="child">mounted</div>
        </StoreProvider>
      );
    })).resolves.not.toThrow();

    // warn should have been called by saveState
    expect(warn).toHaveBeenCalled();
  });

  it('dispatching ADD_INCOME updates React state even when save fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

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

    const cashBefore = capturedCash;

    await act(async () => {
      capturedDispatch({ type: 'ADD_INCOME', amount: 500, source: 'Salary' });
    });

    expect(capturedCash).toBe(cashBefore + 500); // in-memory state updated
  });

  it('loadState succeeds even if setItem throws (reads are unaffected)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // loadState uses getItem (read) and only calls setItem for snapshots.
    // The snapshot write failure should be caught and not crash loadState.
    expect(() => loadState()).not.toThrow();
  });
});
