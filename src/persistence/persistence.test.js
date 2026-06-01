import { jest } from '@jest/globals';
import { saveToLocal, loadFromLocal } from './index.js';

const STORAGE_KEY = 'ship_log_map_v1';

beforeEach(() => localStorage.clear());
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// RED → GREEN: invalid mode must be sanitized on load
// ---------------------------------------------------------------------------
describe('loadFromLocal — mode sanitization', () => {
  test('returns editing when stored mode is an invalid value', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      nodes: [], edges: [], notes: {}, mode: 'corrupted', __version: 1
    }));
    const result = loadFromLocal();
    expect(result.mode).toBe('editing');
  });
});

// ---------------------------------------------------------------------------
// Baseline behaviors (should all be GREEN from the start)
// ---------------------------------------------------------------------------
describe('loadFromLocal — baseline behaviors', () => {
  test('returns null when localStorage is empty', () => {
    expect(loadFromLocal()).toBeNull();
  });

  test('valid mode "playing" round-trips correctly', () => {
    const graph = { nodes: [], edges: [], notes: {}, mode: 'playing',
                    mapName: 'myMap', cdnBaseUrl: '', orientation: 0 };
    saveToLocal(graph);
    expect(loadFromLocal().mode).toBe('playing');
  });

  test('valid mode "editing" round-trips correctly', () => {
    const graph = { nodes: [], edges: [], notes: {}, mode: 'editing',
                    mapName: 'myMap', cdnBaseUrl: '', orientation: 0 };
    saveToLocal(graph);
    expect(loadFromLocal().mode).toBe('editing');
  });

  test('missing mode field defaults to "editing"', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      nodes: [], edges: [], notes: {}, __version: 1
    }));
    const result = loadFromLocal();
    expect(result.mode).toBe('editing');
  });

  test('mapName, cdnBaseUrl, and orientation survive a save/load round-trip', () => {
    const graph = { nodes: [], edges: [], notes: {}, mode: 'editing',
                    mapName: 'testMap', cdnBaseUrl: 'https://cdn.example.com', orientation: 90 };
    saveToLocal(graph);
    const result = loadFromLocal();
    expect(result.mapName).toBe('testMap');
    expect(result.cdnBaseUrl).toBe('https://cdn.example.com');
    expect(result.orientation).toBe(90);
  });
});
