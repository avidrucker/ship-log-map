import { renderHook, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import useVisited from './useVisited.js';

const KEY = (mapName) => `shiplog.visited.v1:${mapName}`;

beforeEach(() => localStorage.clear());
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// RED → GREEN: map switch must not transiently corrupt the new map's data
// ---------------------------------------------------------------------------
describe('useVisited — map switch safety', () => {
  test('switching mapName never writes stale visited data under the new map key', () => {
    localStorage.setItem(KEY('mapB'), JSON.stringify({ nodes: ['b1'], edges: [] }));

    const { result, rerender } = renderHook(
      ({ mapName }) => useVisited(mapName),
      { initialProps: { mapName: 'mapA' } }
    );

    // Build non-empty mapA visited state
    act(() => { result.current.markNodeVisited('a1'); });

    // Track every localStorage.setItem call that happens during the switch
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

    act(() => { rerender({ mapName: 'mapB' }); });

    // The persist effect must never write mapA's data ('a1') under mapB's key
    const mapBWrites = setItemSpy.mock.calls.filter(([key]) => key === KEY('mapB'));
    const badWrites  = mapBWrites.filter(([, val]) => JSON.parse(val).nodes.includes('a1'));
    expect(badWrites).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Baseline behaviors (all should be GREEN from the start)
// ---------------------------------------------------------------------------
describe('useVisited — baseline behaviors', () => {
  test('markNodeVisited adds the id to in-memory visited state', () => {
    const { result } = renderHook(() => useVisited('testMap'));
    act(() => { result.current.markNodeVisited('node1'); });
    expect(result.current.visited.nodes.has('node1')).toBe(true);
  });

  test('markNodeVisited persists the id to localStorage', () => {
    const { result } = renderHook(() => useVisited('testMap'));
    act(() => { result.current.markNodeVisited('node1'); });
    const stored = JSON.parse(localStorage.getItem(KEY('testMap')));
    expect(stored.nodes).toContain('node1');
  });

  test('clearForMap empties in-memory visited state', () => {
    localStorage.setItem(KEY('mapA'), JSON.stringify({ nodes: ['a1'], edges: [] }));
    const { result } = renderHook(() => useVisited('mapA'));
    act(() => { result.current.clearForMap(); });
    expect(result.current.visited.nodes.size).toBe(0);
    expect(result.current.visited.edges.size).toBe(0);
  });

  test('clearForMap does not affect other maps in localStorage', () => {
    localStorage.setItem(KEY('mapA'), JSON.stringify({ nodes: ['a1'], edges: [] }));
    localStorage.setItem(KEY('mapB'), JSON.stringify({ nodes: ['b1'], edges: [] }));
    const { result } = renderHook(() => useVisited('mapA'));
    act(() => { result.current.clearForMap(); });
    const mapBStored = JSON.parse(localStorage.getItem(KEY('mapB')));
    expect(mapBStored.nodes).toContain('b1');
  });

  test('returns empty Sets when no localStorage data exists for mapName', () => {
    const { result } = renderHook(() => useVisited('brandNewMap'));
    expect(result.current.visited.nodes.size).toBe(0);
    expect(result.current.visited.edges.size).toBe(0);
  });
});
