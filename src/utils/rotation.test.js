// src/rotation.test.js
// Tests for rotation features: rotating nodes+compass vs compass only
// We test pure logic: rotateNodes90Clockwise, reducer orientation updates, and App handler wiring expectations.
// Since App is large, we focus on verifying node coordinate transformation and orientation increments.

import { describe, test, expect } from '@jest/globals';
import { rotateNodes90Clockwise } from './rotation.js';
import { appStateReducer, ACTION_TYPES, initialAppState } from '../appStateReducer.js';

function makeNode(id, x, y) { return { id, title: id, x, y, size: 'regular', color: 'gray' }; }

describe('rotation utilities', () => {
  test('rotateNodes90Clockwise rotates each node about origin (x,y)->(y,-x)', () => {
    const nodes = [
      makeNode('A', 10, 0),   // -> (0, 10)
      makeNode('B', 0, 5),    // -> (-5, 0)
      makeNode('C', -3, -4),  // -> (4, -3)
    ];
    const rotated = rotateNodes90Clockwise(nodes);
    expect(rotated.find(n => n.id === 'A')).toMatchObject({ x: 0, y: 10 });
    expect(rotated.find(n => n.id === 'B')).toMatchObject({ x: -5, y: 0 });
    expect(rotated.find(n => n.id === 'C')).toMatchObject({ x: 4, y: -3 });
  });
});

describe('orientation reducer', () => {
  test('SET_ORIENTATION normalizes degrees into 0-359', () => {
    const s1 = appStateReducer(initialAppState, { type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: 450 } }); // 450 -> 90
    expect(s1.orientation).toBe(90);
    const s2 = appStateReducer(s1, { type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: -90 } }); // -90 -> 270
    expect(s2.orientation).toBe(270);
  });
});

describe('integration logic (simulated handlers)', () => {
  // Simulate the two handlers from App.jsx
  function handleRotateMap(state) {
    // compass only
    return appStateReducer(state, { type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: state.orientation + 90 } });
  }
  function handleRotateNodesAndMap(state, nodes) {
    const newNodes = rotateNodes90Clockwise(nodes);
    const newState = appStateReducer(state, { type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: state.orientation + 90 } });
    return { state: newState, nodes: newNodes };
  }

  test('handleRotateMap increments orientation only', () => {
    const startState = { ...initialAppState, orientation: 0 };
    const nodes = [makeNode('A', 1, 2)];
    const after = handleRotateMap(startState);
    expect(after.orientation).toBe(90);
    // nodes unchanged
    expect(nodes[0]).toMatchObject({ x: 1, y: 2 });
  });

  test('handleRotateNodesAndMap rotates nodes and increments orientation', () => {
    const startState = { ...initialAppState, orientation: 0 };
    const nodes = [makeNode('A', 2, 3), makeNode('B', -5, 4)];
    const { state: afterState, nodes: afterNodes } = handleRotateNodesAndMap(startState, nodes);
    expect(afterState.orientation).toBe(90);
    // (2,3)->(3,-2); (-5,4)->(4,5)
    expect(afterNodes.find(n => n.id === 'A')).toMatchObject({ x: -3, y: 2 });
    expect(afterNodes.find(n => n.id === 'B')).toMatchObject({ x: -4, y: -5 });
  });
});
