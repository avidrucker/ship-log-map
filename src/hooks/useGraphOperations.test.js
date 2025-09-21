// src/hooks/useGraphOperations.test.js
import { renderHook, act } from '@testing-library/react';
import { useGraphOperations } from './useGraphOperations.js';
import { ACTION_TYPES } from '../appStateReducer.js';

describe('useGraphOperations hook', () => {
  let mockParams;
  let mockCyInstance;
  let mockNode;

  beforeEach(() => {
    // Mock Cytoscape node
    mockNode = {
      length: 1,
      position: () => {},
      select: () => {},
      unselect: () => {}
    };

    // Mock Cytoscape instance
    mockCyInstance = {
      fit: () => {},
      zoom: () => 1,
      pan: () => ({ x: 0, y: 0 }),
      nodes: () => ({ length: 2 }),
      getElementById: () => mockNode,
      elements: () => ({
        unselect: () => {}
      })
    };

    // Mock parameters
    mockParams = {
      cy: () => mockCyInstance,
      dispatch: () => {},
      graph: {
        nodes: [
          { id: 'node1', title: 'Node 1', x: 100, y: 100, size: 'regular', color: 'blue' },
          { id: 'node2', title: 'Node 2', x: 200, y: 200, size: 'regular', color: 'red' }
        ],
        edges: [
          { id: 'edge1', source: 'node1', target: 'node2', direction: 'forward' }
        ],
        notes: {},
        orientation: 0
      },
      selections: {
        selectedNodeIds: ['node1'],
        nodeSelectionOrder: ['node1'],
        selectedEdgeIds: ['edge1']
      },
      saveUndoCheckpoint: () => {},
      setGraphData: () => {},
      clearCytoscapeSelections: () => {},
      updateNodeInPlace: () => {},
      getViewportCenter: () => ({ x: 150, y: 150 })
    };
  });

  test('returns expected functions', () => {
    const { result } = renderHook(() => useGraphOperations(mockParams));

    expect(result.current).toHaveProperty('handleRotateLeft');
    expect(result.current).toHaveProperty('handleRotateRight');
    expect(result.current).toHaveProperty('handleFitGraph');
    expect(result.current).toHaveProperty('handleNodeMove');
    expect(result.current).toHaveProperty('handleCreateNode');
    expect(result.current).toHaveProperty('handleDeleteSelectedNodes');
    expect(result.current).toHaveProperty('handleDeleteSelectedEdges');
    expect(result.current).toHaveProperty('handleConnectSelectedNodes');
    expect(result.current).toHaveProperty('handleEdgeDirectionChange');
    expect(result.current).toHaveProperty('handleNodeSizeChange');
    expect(result.current).toHaveProperty('handleNodeColorChange');
    expect(result.current).toHaveProperty('handleRotateNodesAndMap');

    // Verify all returned functions are actually functions
    Object.values(result.current).forEach(fn => {
      expect(typeof fn).toBe('function');
    });
  });

  test('handleRotateRight dispatches correct orientation', () => {
    const dispatchCalls = [];
    const paramsWithMockDispatch = {
      ...mockParams,
      dispatch: (action) => { dispatchCalls.push(action); }
    };

    const { result } = renderHook(() => useGraphOperations(paramsWithMockDispatch));

    act(() => {
      result.current.handleRotateRight();
    });

    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0]).toEqual({
      type: ACTION_TYPES.SET_ORIENTATION,
      payload: { orientation: 90 }
    });
  });

  test('handleRotateLeft dispatches correct orientation', () => {
    const dispatchCalls = [];
    const paramsWithMockDispatch = {
      ...mockParams,
      dispatch: (action) => { dispatchCalls.push(action); },
      graph: { ...mockParams.graph, orientation: 90 }
    };

    const { result } = renderHook(() => useGraphOperations(paramsWithMockDispatch));

    act(() => {
      result.current.handleRotateLeft();
    });

    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0]).toEqual({
      type: ACTION_TYPES.SET_ORIENTATION,
      payload: { orientation: 0 }
    });
  });

  test('handleNodeMove saves undo and updates graph data', () => {
    const saveUndoCalls = [];
    const setGraphDataCalls = [];
    const paramsWithMocks = {
      ...mockParams,
      saveUndoCheckpoint: (state) => { saveUndoCalls.push(state); },
      setGraphData: (fn) => { 
        const result = fn(mockParams.graph);
        setGraphDataCalls.push(result);
      }
    };

    const { result } = renderHook(() => useGraphOperations(paramsWithMocks));

    act(() => {
      result.current.handleNodeMove('node1', { x: 300, y: 300 });
    });

    expect(saveUndoCalls).toHaveLength(1);
    expect(saveUndoCalls[0]).toEqual({
      nodes: mockParams.graph.nodes,
      edges: mockParams.graph.edges,
      notes: mockParams.graph.notes,
      orientation: mockParams.graph.orientation
    });

    expect(setGraphDataCalls).toHaveLength(1);
    expect(setGraphDataCalls[0].nodes[0]).toEqual({
      id: 'node1',
      title: 'Node 1',
      x: 300,
      y: 300,
      size: 'regular',
      color: 'blue'
    });
  });

  test('handleCreateNode creates unique node', () => {
    const saveUndoCalls = [];
    const setGraphDataCalls = [];
    const paramsWithMocks = {
      ...mockParams,
      saveUndoCheckpoint: (state) => { saveUndoCalls.push(state); },
      setGraphData: (fn) => { 
        const result = fn(mockParams.graph);
        setGraphDataCalls.push(result);
      }
    };

    const { result } = renderHook(() => useGraphOperations(paramsWithMocks));

    act(() => {
      result.current.handleCreateNode();
    });

    expect(saveUndoCalls).toHaveLength(1);
    expect(setGraphDataCalls).toHaveLength(1);
    
    const newNodes = setGraphDataCalls[0].nodes;
    expect(newNodes).toHaveLength(3);
    
    const newNode = newNodes[2];
    expect(newNode.id).toBe('untitled1');
    expect(newNode.title).toBe('untitled1');
    expect(newNode.x).toBe(150);
    expect(newNode.y).toBe(150);
    expect(newNode.size).toBe('regular');
    expect(newNode.color).toBe('gray');
    expect(newNode.imageUrl).toBe('unspecified');
  });

  test('handleDeleteSelectedNodes removes nodes and connected edges', () => {
    const saveUndoCalls = [];
    const setGraphDataCalls = [];
    const dispatchCalls = [];
    const clearSelectionCalls = [];
    
    const paramsWithMocks = {
      ...mockParams,
      saveUndoCheckpoint: (state) => { saveUndoCalls.push(state); },
      setGraphData: (fn) => { 
        const result = fn(mockParams.graph);
        setGraphDataCalls.push(result);
      },
      dispatch: (action) => { dispatchCalls.push(action); },
      clearCytoscapeSelections: () => { clearSelectionCalls.push('called'); }
    };

    const { result } = renderHook(() => useGraphOperations(paramsWithMocks));

    act(() => {
      result.current.handleDeleteSelectedNodes(['node1']);
    });

    expect(saveUndoCalls).toHaveLength(1);
    expect(setGraphDataCalls).toHaveLength(1);
    expect(clearSelectionCalls).toHaveLength(1);
    expect(dispatchCalls).toHaveLength(1);
    
    const updatedGraph = setGraphDataCalls[0];
    expect(updatedGraph.nodes).toHaveLength(1);
    expect(updatedGraph.nodes[0].id).toBe('node2');
    expect(updatedGraph.edges).toHaveLength(0); // Edge should be removed too
    
    expect(dispatchCalls[0]).toEqual({
      type: ACTION_TYPES.SET_NODE_SELECTION,
      payload: { nodeIds: [], selectionOrder: [] }
    });
  });

  test('handleDeleteSelectedEdges removes edges only', () => {
    const saveUndoCalls = [];
    const setGraphDataCalls = [];
    const paramsWithMocks = {
      ...mockParams,
      saveUndoCheckpoint: (state) => { saveUndoCalls.push(state); },
      setGraphData: (fn) => { 
        const result = fn(mockParams.graph);
        setGraphDataCalls.push(result);
      }
    };

    const { result } = renderHook(() => useGraphOperations(paramsWithMocks));

    act(() => {
      result.current.handleDeleteSelectedEdges(['edge1']);
    });

    expect(saveUndoCalls).toHaveLength(1);
    expect(setGraphDataCalls).toHaveLength(1);
    
    const updatedGraph = setGraphDataCalls[0];
    expect(updatedGraph.nodes).toHaveLength(2); // Nodes should remain
    expect(updatedGraph.edges).toHaveLength(0); // Edge should be removed
  });

  test('handleConnectSelectedNodes creates edge between selected nodes', () => {
    const saveUndoCalls = [];
    const setGraphDataCalls = [];
    const paramsWithTwoSelected = {
      ...mockParams,
      selections: {
        selectedNodeIds: ['node1', 'node2'],
        nodeSelectionOrder: ['node1', 'node2'],
        selectedEdgeIds: []
      },
      graph: {
        ...mockParams.graph,
        edges: [] // Start with no edges
      },
      saveUndoCheckpoint: (state) => { saveUndoCalls.push(state); },
      setGraphData: (fn) => { 
        const result = fn({ ...mockParams.graph, edges: [] });
        setGraphDataCalls.push(result);
      }
    };

    const { result } = renderHook(() => useGraphOperations(paramsWithTwoSelected));

    act(() => {
      result.current.handleConnectSelectedNodes();
    });

    expect(saveUndoCalls).toHaveLength(1);
    expect(setGraphDataCalls).toHaveLength(1);
    
    const updatedGraph = setGraphDataCalls[0];
    expect(updatedGraph.edges).toHaveLength(1);
    
    const newEdge = updatedGraph.edges[0];
    expect(newEdge.source).toBe('node1');
    expect(newEdge.target).toBe('node2');
    expect(newEdge.direction).toBe('forward');
    expect(newEdge.id).toBe('node1__node2'); // ->
  });

  test('handleEdgeDirectionChange updates edge direction', () => {
    const saveUndoCalls = [];
    const setGraphDataCalls = [];
    const paramsWithMocks = {
      ...mockParams,
      saveUndoCheckpoint: (state) => { saveUndoCalls.push(state); },
      setGraphData: (fn) => { 
        const result = fn(mockParams.graph);
        setGraphDataCalls.push(result);
      }
    };

    const { result } = renderHook(() => useGraphOperations(paramsWithMocks));

    act(() => {
      result.current.handleEdgeDirectionChange('edge1', 'backward');
    });

    expect(saveUndoCalls).toHaveLength(1);
    expect(setGraphDataCalls).toHaveLength(1);
    
    const updatedGraph = setGraphDataCalls[0];
    expect(updatedGraph.edges[0].direction).toBe('backward');
  });

  test('handleNodeSizeChange updates node size', () => {
    const saveUndoCalls = [];
    const setGraphDataCalls = [];
    const updateNodeCalls = [];
    const paramsWithMocks = {
      ...mockParams,
      saveUndoCheckpoint: (state) => { saveUndoCalls.push(state); },
      setGraphData: (fn) => { 
        const result = fn(mockParams.graph);
        setGraphDataCalls.push(result);
      },
      updateNodeInPlace: (nodeId, props) => { updateNodeCalls.push({ nodeId, props }); }
    };

    const { result } = renderHook(() => useGraphOperations(paramsWithMocks));

    act(() => {
      result.current.handleNodeSizeChange('node1', 'double');
    });

    expect(saveUndoCalls).toHaveLength(1);
    expect(updateNodeCalls).toHaveLength(1);
    expect(updateNodeCalls[0]).toEqual({ nodeId: 'node1', props: { size: 'double' } });
    expect(setGraphDataCalls).toHaveLength(1);
    
    const updatedGraph = setGraphDataCalls[0];
    expect(updatedGraph.nodes[0].size).toBe('double');
  });

  test('handleNodeColorChange updates node colors', () => {
    const saveUndoCalls = [];
    const setGraphDataCalls = [];
    const updateNodeCalls = [];
    const paramsWithMocks = {
      ...mockParams,
      saveUndoCheckpoint: (state) => { saveUndoCalls.push(state); },
      setGraphData: (fn) => { 
        const result = fn(mockParams.graph);
        setGraphDataCalls.push(result);
      },
      updateNodeInPlace: (nodeId, props) => { updateNodeCalls.push({ nodeId, props }); }
    };

    const { result } = renderHook(() => useGraphOperations(paramsWithMocks));

    act(() => {
      result.current.handleNodeColorChange(['node1', 'node2'], 'green');
    });

    expect(saveUndoCalls).toHaveLength(1);
    expect(updateNodeCalls).toHaveLength(2);
    expect(updateNodeCalls[0]).toEqual({ nodeId: 'node1', props: { color: 'green' } });
    expect(updateNodeCalls[1]).toEqual({ nodeId: 'node2', props: { color: 'green' } });
    expect(setGraphDataCalls).toHaveLength(1);
    
    const updatedGraph = setGraphDataCalls[0];
    expect(updatedGraph.nodes[0].color).toBe('green');
    expect(updatedGraph.nodes[1].color).toBe('green');
  });

  test('handleFitGraph calls Cytoscape fit and updates camera state', () => {
    const fitCalls = [];
    const dispatchCalls = [];
    const mockCyWithFit = {
      ...mockCyInstance,
      fit: (nodes, padding) => { fitCalls.push({ nodes, padding }); },
      zoom: () => 1.5,
      pan: () => ({ x: 10, y: 20 })
    };

    const paramsWithMocks = {
      ...mockParams,
      cy: () => mockCyWithFit,
      dispatch: (action) => { dispatchCalls.push(action); }
    };

    const { result } = renderHook(() => useGraphOperations(paramsWithMocks));

    act(() => {
      result.current.handleFitGraph();
    });

    expect(fitCalls).toHaveLength(1);
    expect(fitCalls[0].padding).toBe(50);
    
    expect(dispatchCalls).toHaveLength(2);
    expect(dispatchCalls[0]).toEqual({
      type: ACTION_TYPES.SET_ZOOM_INTERNAL,
      payload: { zoom: 1.5 }
    });
    expect(dispatchCalls[1]).toEqual({
      type: ACTION_TYPES.SET_CAMERA_POSITION_INTERNAL,
      payload: { position: { x: 10, y: 20 } }
    });
  });

  test('handles missing Cytoscape instance gracefully', () => {
    const paramsWithNoCy = {
      ...mockParams,
      cy: () => null
    };

    const { result } = renderHook(() => useGraphOperations(paramsWithNoCy));

    expect(() => {
      act(() => {
        result.current.handleFitGraph();
        result.current.handleResetSelection();
      });
    }).not.toThrow();
  });
});