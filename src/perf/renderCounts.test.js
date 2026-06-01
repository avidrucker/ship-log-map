// src/perf/renderCounts.test.js
// Deterministic render-count and reference-stability assertions.
// Included in `npm test` (no timing; counts are exact).
// These tests document expected React batching behavior and will go RED
// when a hotspot is introduced. Tests marked "RED before opt" will fail
// until the named optimization is applied.

import { jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useHashtagIndex } from '../search/useHashtagIndex.js';
import { useCamera } from '../hooks/useCamera.js';

// Stable empty array — avoids triggering useHashtagIndex's effect on every render
const NO_EDGES = [];

function makeNodes(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `node_${i}`,
    title: `Place ${i} Name`,
    note: `#tag${i % 5} text`,
  }));
}

// ---------------------------------------------------------------------------
// useHashtagIndex — render counts
// ---------------------------------------------------------------------------
describe('useHashtagIndex — render counts', () => {
  test('changing nodes triggers at most 2 consumer renders (React 19 batches effect setState)', async () => {
    const nodes10 = makeNodes(10);
    let renderCount = 0;

    const { rerender } = renderHook(
      ({ ns }) => { renderCount++; return useHashtagIndex({ nodes: ns, edges: NO_EDGES}); },
      { initialProps: { ns: nodes10 } }
    );
    await act(async () => {}); // flush initial effects
    renderCount = 0;

    const nodes11 = [...nodes10, { id: 'new', title: 'New Place', note: '#new' }];
    await act(async () => { rerender({ ns: nodes11 }); });

    // 1: rerender() → sync render; 2: effect rebuilds index → batched state → 1 render
    expect(renderCount).toBeLessThanOrEqual(2);
  });

  test('same nodes reference does not trigger an index rebuild or extra render', async () => {
    const nodes = makeNodes(10);
    let renderCount = 0;

    const { rerender } = renderHook(
      ({ ns }) => { renderCount++; return useHashtagIndex({ nodes: ns, edges: NO_EDGES}); },
      { initialProps: { ns: nodes } }
    );
    await act(async () => {}); // flush initial effects
    renderCount = 0;

    // Re-render with the exact same reference — useEffect deps unchanged
    await act(async () => { rerender({ ns: nodes }); });

    // Only 1 render (for the rerender() call itself); effect must NOT re-run
    expect(renderCount).toBeLessThanOrEqual(1);
  });

  // RED before Opt-B (memoize getSuggestions with useCallback)
  test('getSuggestions reference is stable when graph has not changed', async () => {
    const nodes = makeNodes(10);
    const { result, rerender } = renderHook(
      ({ ns }) => useHashtagIndex({ nodes: ns, edges: NO_EDGES}),
      { initialProps: { ns: nodes } }
    );
    await act(async () => {}); // flush initial effects

    const firstRef = result.current.getSuggestions;

    await act(async () => { rerender({ ns: nodes }); }); // same ref → no effect re-run
    const secondRef = result.current.getSuggestions;

    // Current code: FAILS — plain function, new object every render
    // After Opt-B:  PASSES — useCallback stabilizes the reference
    expect(secondRef).toBe(firstRef);
  });

  // RED before Opt-B
  test('findMatchesFromTokens reference is stable when graph has not changed', async () => {
    const nodes = makeNodes(10);
    const { result, rerender } = renderHook(
      ({ ns }) => useHashtagIndex({ nodes: ns, edges: NO_EDGES}),
      { initialProps: { ns: nodes } }
    );
    await act(async () => {});

    const firstRef = result.current.findMatchesFromTokens;
    await act(async () => { rerender({ ns: nodes }); });
    const secondRef = result.current.findMatchesFromTokens;

    expect(secondRef).toBe(firstRef);
  });
});

// ---------------------------------------------------------------------------
// useCamera — debounce assertions
// ---------------------------------------------------------------------------
describe('useCamera — debounce behavior', () => {
  afterEach(() => jest.useRealTimers());

  test('10 rapid viewport changes cause 0 immediate renders (all debounced)', () => {
    const dispatch = jest.fn();
    const appState = { camera: { zoom: 1, position: { x: 0, y: 0 } } };
    let renderCount = 0;

    const { result } = renderHook(() => {
      renderCount++;
      return useCamera(dispatch, appState);
    });
    renderCount = 0; // reset after mount

    // Fire 10 events synchronously — no real time passes, all get debounced
    for (let i = 0; i < 10; i++) {
      result.current.onViewportChange({ pan: { x: i * 10, y: 0 }, zoom: 1 + i * 0.01 });
    }

    // The 100ms timer has not fired yet → no state updates → 0 renders
    expect(renderCount).toBe(0);
  });

  test('10 rapid viewport changes collapse to exactly 1 render after 100ms debounce', async () => {
    jest.useFakeTimers();

    const dispatch = jest.fn();
    const appState = { camera: { zoom: 1, position: { x: 0, y: 0 } } };
    let renderCount = 0;

    const { result } = renderHook(() => {
      renderCount++;
      return useCamera(dispatch, appState);
    });
    renderCount = 0;

    for (let i = 0; i < 10; i++) {
      result.current.onViewportChange({ pan: { x: i * 10, y: 0 }, zoom: 1 + i * 0.01 });
    }

    // Flush the 100ms debounce timer — setLiveZoom + setLivePan fire, batched → 1 render
    await act(async () => { jest.advanceTimersByTime(110); });

    expect(renderCount).toBe(1);
  });
});
