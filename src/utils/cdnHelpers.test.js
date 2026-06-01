import { jest } from '@jest/globals';
import { handleLoadFromCdn } from './cdnHelpers.js';
import { ACTION_TYPES } from '../appStateReducer.js';

afterEach(() => {
  jest.restoreAllMocks();
  delete global.fetch;
});

// Minimal params factory — lets each test override only what it needs
function makeParams(overrides = {}) {
  const ref = { current: null };
  return {
    cdnBaseUrl: 'https://cdn.example.com',
    mapName: 'testMap',
    setCdnLoadingState: jest.fn(),
    setIsLoadingFromCDN: jest.fn(),
    currentCdnLoadRef: ref,
    normalizeGraphData: (d) => ({
      nodes: [], edges: [], notes: {}, mode: 'editing',
      mapName: 'testMap', cdnBaseUrl: '', orientation: 0,
      bgImage: { included: false, imageUrl: '', x: 0, y: 0, scale: 100, opacity: 100, visible: false },
      ...d
    }),
    hydrateCoordsIfMissing: (g) => g,
    setGraphData: jest.fn(),
    dispatchAppState: jest.fn(),
    clearCytoscapeSelections: jest.fn(),
    clearUndoState: jest.fn(),
    defaultShipLogData: { nodes: [], edges: [] },
    ACTION_TYPES,
    setBgImage: jest.fn(),
    ...overrides,
    // let overrides replace the ref but keep it accessible
    _ref: overrides.currentCdnLoadRef || ref,
  };
}

// Minimal JSON response for a successful CDN fetch
function successFetch(data = {}) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ nodes: [], edges: [], notes: {}, mode: 'editing',
                          mapName: 'testMap', bgImage: { included: false }, ...data })
  });
}

// ---------------------------------------------------------------------------
// Concurrent-load guard behaviors (all GREEN with current code)
// ---------------------------------------------------------------------------
describe('handleLoadFromCdn — concurrent load guard', () => {
  test('a second call while a load is in-flight is a no-op', async () => {
    const params = makeParams();
    // Simulate a load already in progress
    params.currentCdnLoadRef.current = 'https://cdn.example.com/testmap.json';

    await handleLoadFromCdn(params);

    expect(params.setGraphData).not.toHaveBeenCalled();
    expect(params.setCdnLoadingState).not.toHaveBeenCalled();
  });

  test('after a successful load the ref is falsy so a new load is allowed', async () => {
    global.fetch = successFetch();
    const params = makeParams();

    await handleLoadFromCdn(params);

    expect(params._ref.current).toBeFalsy();
  });

  test('after a failed load (non-ok response) the ref is falsy so a retry is allowed', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    const params = makeParams();

    await handleLoadFromCdn(params);

    expect(params._ref.current).toBeFalsy();
  });

  test('after a network-level error the ref is falsy so a retry is allowed', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    const params = makeParams();

    await handleLoadFromCdn(params);

    expect(params._ref.current).toBeFalsy();
  });
});
