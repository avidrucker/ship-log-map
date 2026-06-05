// RED tests for TASK-001: extract note-viewer state machine into useNoteViewingState.
// These tests describe the target interface and FAIL until the stub in
// useNoteViewingState.js is replaced with the real implementation.
// See docs/tasks.md TASK-001 for full context.
//
// Interface under test:
//   const { open, close, isOpen, activeNodeId } = useNoteViewingState({
//     dispatchAppState,   // (action) => void — updates reducer note-viewing state
//     fitToNode,          // (nodeId) => void — Cytoscape zoom-to-node
//     restoreCamera,      // () => void — restores pre-open camera position
//   });
//
// open(nodeId)  — opens viewer; if already open, switches target without restoring camera
// close()       — closes viewer; restores camera unless a switch is in progress
// isOpen        — true when a target is active
// activeNodeId  — the current target node id, or null

import { describe, test, expect, jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useNoteViewingState } from './useNoteViewingState';

function makeOpts(overrides = {}) {
  return {
    dispatchAppState: jest.fn(),
    fitToNode: jest.fn(),
    restoreCamera: jest.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// open
// ---------------------------------------------------------------------------

describe('open', () => {
  test('open(nodeId) makes isOpen true', () => {
    const { result } = renderHook(() => useNoteViewingState(makeOpts()));
    act(() => result.current.open('node-1'));
    expect(result.current.isOpen).toBe(true);
  });

  test('open(nodeId) sets activeNodeId', () => {
    const { result } = renderHook(() => useNoteViewingState(makeOpts()));
    act(() => result.current.open('node-42'));
    expect(result.current.activeNodeId).toBe('node-42');
  });

  test('open(nodeId) calls fitToNode with that nodeId', () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useNoteViewingState(opts));
    act(() => result.current.open('node-7'));
    expect(opts.fitToNode).toHaveBeenCalledWith('node-7');
  });

  test('open(nodeId) dispatches START_NOTE_VIEWING with the nodeId', () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useNoteViewingState(opts));
    act(() => result.current.open('node-3'));
    expect(opts.dispatchAppState).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ targetId: 'node-3' }) })
    );
  });
});

// ---------------------------------------------------------------------------
// close
// ---------------------------------------------------------------------------

describe('close', () => {
  test('close() makes isOpen false', () => {
    const { result } = renderHook(() => useNoteViewingState(makeOpts()));
    act(() => result.current.open('node-1'));
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  test('close() clears activeNodeId', () => {
    const { result } = renderHook(() => useNoteViewingState(makeOpts()));
    act(() => result.current.open('node-1'));
    act(() => result.current.close());
    expect(result.current.activeNodeId).toBeNull();
  });

  test('close() calls restoreCamera', () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useNoteViewingState(opts));
    act(() => result.current.open('node-1'));
    act(() => result.current.close());
    expect(opts.restoreCamera).toHaveBeenCalled();
  });

  test('close() when already closed does not call restoreCamera', () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useNoteViewingState(opts));
    act(() => result.current.close());
    expect(opts.restoreCamera).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// target switching — open() while already open should not restore camera
// ---------------------------------------------------------------------------

describe('target switching', () => {
  test('open(newNodeId) while already open updates activeNodeId', () => {
    const { result } = renderHook(() => useNoteViewingState(makeOpts()));
    act(() => result.current.open('node-1'));
    act(() => result.current.open('node-2'));
    expect(result.current.activeNodeId).toBe('node-2');
  });

  test('open(newNodeId) while already open does not call restoreCamera', () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useNoteViewingState(opts));
    act(() => result.current.open('node-1'));
    act(() => result.current.open('node-2'));
    expect(opts.restoreCamera).not.toHaveBeenCalled();
  });

  test('open(newNodeId) while already open calls fitToNode with the new id', () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useNoteViewingState(opts));
    act(() => result.current.open('node-1'));
    opts.fitToNode.mockClear();
    act(() => result.current.open('node-2'));
    expect(opts.fitToNode).toHaveBeenCalledWith('node-2');
  });

  test('close() after a switch restores camera', () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useNoteViewingState(opts));
    act(() => result.current.open('node-1'));
    act(() => result.current.open('node-2'));
    act(() => result.current.close());
    expect(opts.restoreCamera).toHaveBeenCalled();
  });
});
