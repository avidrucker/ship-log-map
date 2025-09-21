// src/hooks/useUndo.test.js - Comprehensive test suite
import { renderHook, act } from '@testing-library/react';
import { useUndo } from './useUndo.js';
import { ACTION_TYPES } from '../appStateReducer.js';

// Simple test to verify basic functionality
describe('useUndo hook', () => {
  test('returns expected functions and properties', () => {
    const mockAppState = { undo: { lastGraphState: null } };
    const mockDispatch = () => {};
    const mockGetCytoscape = () => null;
    const mockClearSelections = () => {};

    const { result } = renderHook(() => 
      useUndo(mockAppState, mockDispatch, mockGetCytoscape, mockClearSelections)
    );

    expect(result.current).toHaveProperty('clearUndoState');
    expect(result.current).toHaveProperty('saveUndoCheckpoint');
    expect(result.current).toHaveProperty('applyUndoIfAvailable');
    expect(result.current).toHaveProperty('canUndo');
    expect(typeof result.current.clearUndoState).toBe('function');
    expect(typeof result.current.saveUndoCheckpoint).toBe('function');
    expect(typeof result.current.applyUndoIfAvailable).toBe('function');
    expect(result.current.canUndo).toBe(false);
  });

  test('canUndo returns true when undo state is available', () => {
    const mockAppState = { 
      undo: { 
        lastGraphState: { nodes: [], edges: [], notes: {} } 
      } 
    };
    const mockDispatch = () => {};
    const mockGetCytoscape = () => null;
    const mockClearSelections = () => {};

    const { result } = renderHook(() => 
      useUndo(mockAppState, mockDispatch, mockGetCytoscape, mockClearSelections)
    );

    expect(result.current.canUndo).toBe(true);
  });

  test('clearUndoState dispatches CLEAR_UNDO_STATE action', () => {
    const mockAppState = { undo: { lastGraphState: null } };
    const dispatchCalls = [];
    const mockDispatch = (action) => { dispatchCalls.push(action); };
    const mockGetCytoscape = () => null;
    const mockClearSelections = () => {};

    const { result } = renderHook(() => 
      useUndo(mockAppState, mockDispatch, mockGetCytoscape, mockClearSelections)
    );

    act(() => {
      result.current.clearUndoState();
    });

    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0]).toEqual({
      type: ACTION_TYPES.CLEAR_UNDO_STATE
    });
  });

  test('saveUndoCheckpoint dispatches SET_UNDO_STATE action', () => {
    const mockAppState = { undo: { lastGraphState: null } };
    const dispatchCalls = [];
    const mockDispatch = (action) => { dispatchCalls.push(action); };
    const mockGetCytoscape = () => null;
    const mockClearSelections = () => {};

    const { result } = renderHook(() => 
      useUndo(mockAppState, mockDispatch, mockGetCytoscape, mockClearSelections)
    );

    const graphSnapshot = {
      nodes: [{ id: 'node1', x: 100, y: 200 }],
      edges: [],
      notes: {},
      orientation: 90
    };

    act(() => {
      result.current.saveUndoCheckpoint(graphSnapshot);
    });

    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0]).toEqual({
      type: ACTION_TYPES.SET_UNDO_STATE,
      payload: { graphState: graphSnapshot }
    });
  });

  test('applyUndoIfAvailable returns false when no undo state', () => {
    const mockAppState = { undo: { lastGraphState: null } };
    const mockDispatch = () => {};
    const mockGetCytoscape = () => null;
    const mockClearSelections = () => {};
    const setGraphDataCalls = [];
    const mockSetGraphData = (data) => { setGraphDataCalls.push(data); };

    const { result } = renderHook(() => 
      useUndo(mockAppState, mockDispatch, mockGetCytoscape, mockClearSelections)
    );

    let returnValue;
    act(() => {
      returnValue = result.current.applyUndoIfAvailable(mockSetGraphData);
    });

    expect(returnValue).toBe(false);
    expect(setGraphDataCalls).toHaveLength(0);
  });

  test('applyUndoIfAvailable applies undo state when available', () => {
    const undoState = {
      nodes: [
        { id: 'node1', x: 100, y: 200 },
        { id: 'node2', x: 300, y: 400 }
      ],
      edges: [],
      notes: {},
      orientation: 90
    };

    const mockAppState = { undo: { lastGraphState: undoState } };
    const dispatchCalls = [];
    const mockDispatch = (action) => { dispatchCalls.push(action); };
    const setGraphDataCalls = [];
    const mockSetGraphData = (data) => { setGraphDataCalls.push(data); };
    const clearSelectionsCalls = [];
    const mockClearSelections = () => { clearSelectionsCalls.push('called'); };

    // Mock Cytoscape instance and nodes
    const positionCalls = [];
    const mockNode = { 
      length: 1, 
      position: (pos) => { positionCalls.push(pos); }
    };
    const mockCyInstance = {
      getElementById: () => mockNode
    };
    const mockGetCytoscape = () => mockCyInstance;

    const { result } = renderHook(() => 
      useUndo(mockAppState, mockDispatch, mockGetCytoscape, mockClearSelections)
    );

    let returnValue;
    act(() => {
      returnValue = result.current.applyUndoIfAvailable(mockSetGraphData);
    });

    expect(returnValue).toBe(true);
    expect(setGraphDataCalls).toHaveLength(1);
    expect(setGraphDataCalls[0]).toEqual(undoState);
    
    // Should dispatch CLEAR_UNDO_STATE and CLEAR_ALL_SELECTIONS
    expect(dispatchCalls).toHaveLength(2);
    expect(dispatchCalls[0]).toEqual({ type: ACTION_TYPES.CLEAR_UNDO_STATE });
    expect(dispatchCalls[1]).toEqual({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
    
    // Should call clearCytoscapeSelections
    expect(clearSelectionsCalls).toHaveLength(1);

    // Should sync node positions
    expect(positionCalls).toHaveLength(2);
    expect(positionCalls[0]).toEqual({ x: 100, y: 200 });
    expect(positionCalls[1]).toEqual({ x: 300, y: 400 });
  });

  test('handles missing Cytoscape nodes gracefully', () => {
    const undoState = {
      nodes: [{ id: 'nonexistent-node', x: 100, y: 200 }],
      edges: [],
      notes: {}
    };

    const mockAppState = { undo: { lastGraphState: undoState } };
    const mockDispatch = () => {};
    const mockSetGraphData = () => {};
    const mockClearSelections = () => {};

    // Mock node not found (length: 0)
    const mockNode = { length: 0 };
    const mockCyInstance = {
      getElementById: () => mockNode
    };
    const mockGetCytoscape = () => mockCyInstance;

    const { result } = renderHook(() => 
      useUndo(mockAppState, mockDispatch, mockGetCytoscape, mockClearSelections)
    );

    expect(() => {
      act(() => {
        result.current.applyUndoIfAvailable(mockSetGraphData);
      });
    }).not.toThrow();
  });
});