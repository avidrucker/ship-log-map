import React, { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import cytoscapeStyles from "./cytoscapeStyles";

// Debug flag - set to false to disable all debug logging
const DEBUG = false;
const printDebug = (...args) => {
  if (DEBUG) console.log(...args);
};

// Simple test SVG to debug rendering issues
const TEST_ICON_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" preserveAspectRatio="xMidYMid meet">
  <rect x="0" y="0" width="100" height="100" fill="red" stroke="blue" stroke-width="0"/>
  <circle cx="50" cy="50" r="25" fill="yellow"/>
  <text x="50" y="55" text-anchor="middle" font-size="14" fill="black" font-family="Arial">TEST</text>
</svg>`);

// React SVG icon as data URL for demo purposes
const REACT_ICON_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE svg>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-13 -13 26 26" width="100" height="100" preserveAspectRatio="xMidYMid meet">
  <circle cx="0" cy="0" r="2.05" fill="#61dafb"/>
  <g stroke="#61dafb" stroke-width="1" fill="none">
    <ellipse rx="11" ry="4.2"/>
    <ellipse rx="11" ry="4.2" transform="rotate(60)"/>
    <ellipse rx="11" ry="4.2" transform="rotate(120)"/>
  </g>
</svg>`);

const CytoscapeGraph = ({ 
  graphData, 
  onNodeMove, 
  onZoomChange, 
  onCameraMove, 
  initialZoom, 
  initialCameraPosition, 
  shouldFitOnNextRender, 
  onFitCompleted,
  onEdgeSelectionChange,
  onDeleteSelectedEdges,
  onNodeSelectionChange,
  onEdgeDirectionChange,
  onDeleteSelectedNodes,
  onNodeSizeChange,
  onNodeColorChange,
  onNodeClick, // New prop for node single-click
  onEdgeClick, // New prop for edge single-click
  onBackgroundClick, // New prop for background click
  onCytoscapeInstanceReady // New prop to share instance reference
}) => {
  const cyRef = useRef(null);
  const instanceRef = useRef(null); // To prevent multiple Cytoscape initializations
  const currentCameraRef = useRef({ 
    zoom: initialZoom || 1, 
    pan: { x: -(initialCameraPosition?.x || 0), y: -(initialCameraPosition?.y || 0) } 
  }); // Store current camera state
  const selectionOrderRef = useRef([]); // Track the order of node selection
  
  // Use refs for callbacks to avoid dependency issues
  const onZoomChangeRef = useRef(onZoomChange);
  const onCameraMoveRef = useRef(onCameraMove);
  const onNodeMoveRef = useRef(onNodeMove);
  const onEdgeSelectionChangeRef = useRef(onEdgeSelectionChange);
  const onDeleteSelectedEdgesRef = useRef(onDeleteSelectedEdges);
  const onNodeSelectionChangeRef = useRef(onNodeSelectionChange);
  const onEdgeDirectionChangeRef = useRef(onEdgeDirectionChange);
  const onDeleteSelectedNodesRef = useRef(onDeleteSelectedNodes);
  const onNodeSizeChangeRef = useRef(onNodeSizeChange);
  const onNodeColorChangeRef = useRef(onNodeColorChange);
  const onNodeClickRef = useRef(onNodeClick);
  const onEdgeClickRef = useRef(onEdgeClick);
  const onBackgroundClickRef = useRef(onBackgroundClick);
  
  // Update refs when callbacks change
  onZoomChangeRef.current = onZoomChange;
  onCameraMoveRef.current = onCameraMove;
  onNodeMoveRef.current = onNodeMove;
  onEdgeSelectionChangeRef.current = onEdgeSelectionChange;
  onDeleteSelectedEdgesRef.current = onDeleteSelectedEdges;
  onNodeSelectionChangeRef.current = onNodeSelectionChange;
  onEdgeDirectionChangeRef.current = onEdgeDirectionChange;
  onDeleteSelectedNodesRef.current = onDeleteSelectedNodes;
  onNodeSizeChangeRef.current = onNodeSizeChange;
  onNodeColorChangeRef.current = onNodeColorChange;
  onNodeClickRef.current = onNodeClick;
  onEdgeClickRef.current = onEdgeClick;
  onBackgroundClickRef.current = onBackgroundClick;

  // Initialize Cytoscape instance only once or when structure changes
  useEffect(() => {
    printDebug('🔄 Main useEffect triggered - graphData changed');
    if (!cyRef.current) return;  // Wait until div is mounted
    
    // Only recreate if instance doesn't exist or if the number of nodes/edges changed or node IDs changed
    const currentNodeCount = instanceRef.current ? instanceRef.current.nodes().length : 0;
    const currentEdgeCount = instanceRef.current ? instanceRef.current.edges().length : 0;
    const newNodeCount = graphData.nodes.length;
    const newEdgeCount = graphData.edges.length;
    
    // Check if node IDs have changed (for rename operations)
    let nodeIdsChanged = false;
    if (instanceRef.current && currentNodeCount === newNodeCount) {
      const currentNodeIds = instanceRef.current.nodes().map(n => n.id()).sort();
      const newNodeIds = graphData.nodes.map(n => n.id).sort();
      nodeIdsChanged = JSON.stringify(currentNodeIds) !== JSON.stringify(newNodeIds);
      printDebug('🔍 Node IDs check:', {
        currentNodeIds,
        newNodeIds,
        nodeIdsChanged
      });
    }
    
    const needsRecreate = !instanceRef.current || 
      currentNodeCount !== newNodeCount ||
      currentEdgeCount !== newEdgeCount ||
      nodeIdsChanged;

    printDebug('🔍 Recreation check:', {
      hasInstance: !!instanceRef.current,
      currentNodeCount,
      newNodeCount,
      currentEdgeCount,
      newEdgeCount,
      nodeIdsChanged,
      needsRecreate
    });

    if (needsRecreate) {
      printDebug('🏗️ Recreating Cytoscape instance');
      // Store current camera position before destroying
      if (instanceRef.current) {
        // Get the actual current camera state from Cytoscape
        const currentZoom = instanceRef.current.zoom();
        const currentPan = instanceRef.current.pan();
        currentCameraRef.current.zoom = currentZoom;
        currentCameraRef.current.pan = currentPan;
        printDebug('💾 Storing CURRENT camera state before destroy:', {
          zoom: currentZoom,
          pan: currentPan
        });
        instanceRef.current.destroy();
      }

      const elements = [
        ...graphData.nodes.map(n => ({
          data: { 
            id: n.id, 
            label: `${n.title}`, // \n(${n.x}, ${n.y})
            size: n.size || "regular",
            color: n.color || "gray",
            x: n.x, 
            y: n.y,
            icon: TEST_ICON_SVG // REACT_ICON_SVG
          },
          position: { x: n.x, y: n.y }
        })),
        ...graphData.edges.map((e, index) => ({
          data: { 
            id: `edge-${index}`, // Explicit ID for easier tracking
            source: e.source, 
            target: e.target, 
            direction: e.direction || "forward"
          }
        }))
      ];

      instanceRef.current = cytoscape({
        container: cyRef.current,
        elements,
        style: cytoscapeStyles,
        layout: { 
          name: "preset",
          fit: false,  // Never auto-fit during recreation
          padding: 50
        },
        // Enable node dragging and edge selection
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: true,
        selectionType: 'multiple',
        autoungrabify: false
      });

      // Restore camera position after recreation (or set initial on first load)
      if (currentCameraRef.current.zoom !== 1 || currentCameraRef.current.pan.x !== 0 || currentCameraRef.current.pan.y !== 0) {
        printDebug('🔧 Restoring camera state:', currentCameraRef.current);
        instanceRef.current.zoom(currentCameraRef.current.zoom);
        instanceRef.current.pan(currentCameraRef.current.pan);
      } else {
        printDebug('📐 Using default camera state (zoom: 1, pan: 0,0)');
      }

      // Expose the Cytoscape instance to the DOM for the export function
      if (cyRef.current) {
        cyRef.current._cy = instanceRef.current;
      }
      
      // Share the instance reference with parent component
      if (onCytoscapeInstanceReady) {
        onCytoscapeInstanceReady(instanceRef.current);
      }

      // Track drag state to differentiate between clicks and drags
      let isDragging = false;
      let dragStartPosition = null;

      // Add event listener for when node dragging starts
      instanceRef.current.on('grab', 'node', (event) => {
        const node = event.target;
        dragStartPosition = { ...node.position() };
        isDragging = false; // Reset dragging state
      });

      // Add event listener for when node is being dragged
      instanceRef.current.on('drag', 'node', (event) => {
        if (dragStartPosition) {
          const node = event.target;
          const currentPosition = node.position();
          const threshold = 2; // Minimum pixels to consider it a drag
          
          if (Math.abs(currentPosition.x - dragStartPosition.x) > threshold || 
              Math.abs(currentPosition.y - dragStartPosition.y) > threshold) {
            isDragging = true;
          }
        }
      });

      // Add event listener for when node dragging ends
      instanceRef.current.on('free', 'node', (event) => {
        printDebug('🆓 Node free event triggered, isDragging:', isDragging);
        
        // Only process if the node was actually dragged
        if (!isDragging) {
          printDebug('👆 Node was clicked, not dragged - skipping onNodeMove');
          return;
        }
        
        printDebug('🚀 Node was dragged, processing move...');
        const node = event.target;
        const position = node.position();
        const nodeId = node.id();
        
        // Snap to integer coordinates
        const snappedX = Math.round(position.x);
        const snappedY = Math.round(position.y);
        
        printDebug(`📍 Node ${nodeId} moved to: (${snappedX}, ${snappedY})`);
        
        // Update the node's position to snapped coordinates
        node.position({ x: snappedX, y: snappedY });
        
        // Update the node's data with new coordinates
        node.data('x', snappedX);
        node.data('y', snappedY);
        
        // Update the label with new coordinates
        const originalTitle = graphData.nodes.find(n => n.id === nodeId)?.title || node.data('label').split('\n')[0];
        node.data('label', `${originalTitle}`); // \n(${snappedX}, ${snappedY})
        
        // Notify parent component if callback is provided
        if (onNodeMoveRef.current) {
          printDebug('📞 Calling onNodeMove for node:', nodeId, 'new position:', snappedX, snappedY);
          onNodeMoveRef.current(nodeId, snappedX, snappedY);
        }
        
        // Reset drag state
        isDragging = false;
        dragStartPosition = null;
      });

      // Add event listeners for zoom and camera changes
      const updateCameraInfo = () => {
        printDebug('🎥 updateCameraInfo called');
        if (onZoomChangeRef.current) {
          const newZoom = instanceRef.current.zoom();
          printDebug('📏 Zoom changed to:', newZoom);
          onZoomChangeRef.current(newZoom);
        }
        if (onCameraMoveRef.current) {
          const pan = instanceRef.current.pan();
          const cameraPos = { x: -pan.x, y: -pan.y };
          printDebug('📍 Camera position changed to:', cameraPos);
          onCameraMoveRef.current(cameraPos);
        }
      };

      instanceRef.current.on('zoom', updateCameraInfo);
      instanceRef.current.on('pan', updateCameraInfo);
      
      // Edge selection handling
      const handleSelectionChange = () => {
        const selectedEdges = instanceRef.current.$(':selected').edges();
        const selectedEdgeIds = selectedEdges.map(edge => edge.id());
        printDebug('🎯 Edge selection changed:', selectedEdgeIds);
        
        // Ensure container has focus when an edge is selected
        if (selectedEdgeIds.length > 0 && cyRef.current) {
          cyRef.current.focus();
        }
        
        if (onEdgeSelectionChangeRef.current) {
          onEdgeSelectionChangeRef.current(selectedEdgeIds);
        }
      };

      instanceRef.current.on('select', 'edge', handleSelectionChange);
      instanceRef.current.on('unselect', 'edge', handleSelectionChange);
      
      // Node selection handling
      const handleNodeSelectionChange = () => {
        const selectedNodes = instanceRef.current.$(':selected').nodes();
        const selectedNodeIds = selectedNodes.map(node => node.id());
        printDebug('🎯 Node selection changed:', selectedNodeIds);
        
        if (onNodeSelectionChangeRef.current) {
          // Pass both the current selection and the selection order
          onNodeSelectionChangeRef.current(selectedNodeIds, [...selectionOrderRef.current]);
        }
      };

      // Track individual node selections to maintain order
      instanceRef.current.on('select', 'node', (event) => {
        const nodeId = event.target.id();
        // Add to selection order if not already present
        if (!selectionOrderRef.current.includes(nodeId)) {
          selectionOrderRef.current.push(nodeId);
          printDebug('🎯 Node selected (added to order):', nodeId, 'Order:', selectionOrderRef.current);
        }
        
        // Ensure container has focus when a node is selected
        if (cyRef.current) {
          cyRef.current.focus();
        }
        
        handleNodeSelectionChange();
      });

      instanceRef.current.on('unselect', 'node', (event) => {
        const nodeId = event.target.id();
        // Remove from selection order
        selectionOrderRef.current = selectionOrderRef.current.filter(id => id !== nodeId);
        printDebug('🎯 Node unselected (removed from order):', nodeId, 'Order:', selectionOrderRef.current);
        handleNodeSelectionChange();
      });

      // Clear selection order when all nodes are unselected
      instanceRef.current.on('unselect', () => {
        const selectedNodes = instanceRef.current.$(':selected').nodes();
        if (selectedNodes.length === 0) {
          selectionOrderRef.current = [];
          printDebug('🎯 All nodes unselected, cleared selection order');
        }
      });
      
      // Edge double-click handling for direction cycling
      instanceRef.current.on('dblclick', 'edge', (event) => {
        const edgeId = event.target.id();
        const edgeData = event.target.data();
        const currentDirection = edgeData.direction || "forward";
        
        // Cycle through directions: forward -> backward -> bidirectional -> forward
        let newDirection;
        switch (currentDirection) {
          case "forward":
            newDirection = "backward";
            break;
          case "backward":
            newDirection = "bidirectional";
            break;
          case "bidirectional":
            newDirection = "forward";
            break;
          default:
            newDirection = "forward";
        }
        
        printDebug('🔄 Edge direction change:', edgeId, currentDirection, '->', newDirection);
        
        // Update the edge data directly in Cytoscape for immediate visual update
        event.target.data('direction', newDirection);
        
        if (onEdgeDirectionChangeRef.current) {
          onEdgeDirectionChangeRef.current(edgeId, newDirection);
        }
        
        event.stopPropagation();
      });
      
      // Node double-click handling for size cycling
      instanceRef.current.on('dblclick', 'node', (event) => {
        const nodeId = event.target.id();
        const nodeData = event.target.data();
        const currentSize = nodeData.size || "regular";
        
        // Cycle through sizes: half -> regular -> double -> half
        let newSize;
        switch (currentSize) {
          case "half":
            newSize = "regular";
            break;
          case "regular":
            newSize = "double";
            break;
          case "double":
            newSize = "half";
            break;
          default:
            newSize = "regular";
        }
        
        printDebug('🔄 Node size change:', nodeId, currentSize, '->', newSize);
        
        // Update the node data directly in Cytoscape for immediate visual update
        event.target.data('size', newSize);
        
        if (onNodeSizeChangeRef.current) {
          onNodeSizeChangeRef.current(nodeId, newSize);
        }
        
        event.stopPropagation();
      });
      
      // Single-click handling for notes (with delay to distinguish from double-click)
      let nodeClickTimeout = null;
      let edgeClickTimeout = null;
      
      instanceRef.current.on('tap', 'node', (event) => {
        const nodeId = event.target.id();
        
        // Clear any existing timeout
        if (nodeClickTimeout) {
          clearTimeout(nodeClickTimeout);
        }
        
        // Set a timeout to handle single click after double-click detection window
        nodeClickTimeout = setTimeout(() => {
          if (onNodeClickRef.current) {
            onNodeClickRef.current(nodeId, 'node');
          }
          nodeClickTimeout = null;
        }, 250); // 250ms delay to distinguish from double-click
      });
      
      instanceRef.current.on('tap', 'edge', (event) => {
        const edgeId = event.target.id();
        
        // Clear any existing timeout
        if (edgeClickTimeout) {
          clearTimeout(edgeClickTimeout);
        }
        
        // Set a timeout to handle single click after double-click detection window
        edgeClickTimeout = setTimeout(() => {
          if (onEdgeClickRef.current) {
            onEdgeClickRef.current(edgeId, 'edge');
          }
          edgeClickTimeout = null;
        }, 250); // 250ms delay to distinguish from double-click
      });
      
      // Cancel single-click timeouts on double-click
      instanceRef.current.on('dblclick', 'node', () => {
        if (nodeClickTimeout) {
          clearTimeout(nodeClickTimeout);
          nodeClickTimeout = null;
        }
      });
      
      instanceRef.current.on('dblclick', 'edge', () => {
        if (edgeClickTimeout) {
          clearTimeout(edgeClickTimeout);
          edgeClickTimeout = null;
        }
      });
      
      // Background click handling (clicking on the graph background, not on nodes or edges)
      instanceRef.current.on('tap', (event) => {
        // Only handle background clicks (when target is the core, not a node or edge)
        if (event.target === instanceRef.current) {
          if (onBackgroundClickRef.current) {
            onBackgroundClickRef.current();
          }
        }
      });
      
      // Keyboard event handling for delete - simplified approach
      const handleKeyDown = (event) => {
        printDebug('🎹 Key pressed:', event.key);
        
        if (event.key === 'Delete' || event.key === 'Backspace') {
          // Don't process if we're in an input field
          if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
            printDebug('🎹 Ignoring delete key - active element is input field');
            return;
          }
          
          if (!instanceRef.current) {
            printDebug('🎹 ERROR: No Cytoscape instance available');
            return;
          }
          
          const selectedEdges = instanceRef.current.$(':selected').edges();
          const selectedNodes = instanceRef.current.$(':selected').nodes();
          
          printDebug('🎹 Selected elements:', {
            nodes: selectedNodes.length,
            edges: selectedEdges.length
          });
          
          if (selectedNodes.length > 0) {
            // Prioritize node deletion if nodes are selected
            const selectedNodeIds = selectedNodes.map(node => node.id());
            printDebug('🗑️ Deleting selected nodes via keyboard:', selectedNodeIds);
            
            if (onDeleteSelectedNodesRef.current) {
              onDeleteSelectedNodesRef.current(selectedNodeIds);
            }
            event.preventDefault();
            event.stopPropagation();
          } else if (selectedEdges.length > 0) {
            // Delete edges if no nodes are selected
            const selectedEdgeIds = selectedEdges.map(edge => edge.id());
            printDebug('🗑️ Deleting selected edges via keyboard:', selectedEdgeIds);
            
            if (onDeleteSelectedEdgesRef.current) {
              onDeleteSelectedEdgesRef.current(selectedEdgeIds);
            }
            event.preventDefault();
            event.stopPropagation();
          }
        }
      };

      // Add click handler to ensure focus
      const handleContainerClick = () => {
        if (cyRef.current) {
          cyRef.current.focus();
        }
      };
      
      // Set up container for keyboard events
      if (cyRef.current) {
        cyRef.current.addEventListener('keydown', handleKeyDown);
        cyRef.current.addEventListener('click', handleContainerClick);
        cyRef.current.tabIndex = 0; // Make it focusable
        cyRef.current.focus(); // Initially focus the container
        printDebug('� Set up keyboard handling and focused container');
      }
      
      // Don't call updateCameraInfo initially to avoid infinite loop
      // The parent component already has the correct initial values
    } else {
      // Just update existing nodes without recreating the instance
      printDebug('🔄 Updating existing nodes without recreation');
      graphData.nodes.forEach(nodeData => {
        const cyNode = instanceRef.current.$(`#${nodeData.id}`);
        if (cyNode.length > 0) {
          // Update position if it changed (with a small tolerance to avoid infinite loops)
          const currentPos = cyNode.position();
          const deltaX = Math.abs(currentPos.x - nodeData.x);
          const deltaY = Math.abs(currentPos.y - nodeData.y);
          
          if (deltaX > 0.1 || deltaY > 0.1) {
            printDebug(`🔧 Updating position for node ${nodeData.id} from (${currentPos.x}, ${currentPos.y}) to (${nodeData.x}, ${nodeData.y})`);
            cyNode.position({ x: nodeData.x, y: nodeData.y });
          }
          
          // Update data and label (but don't trigger position updates)
          cyNode.data('x', nodeData.x);
          cyNode.data('y', nodeData.y);
          cyNode.data('label', `${nodeData.title}`); // \n(${nodeData.x}, ${nodeData.y})
          cyNode.data('size', nodeData.size || "regular");
          cyNode.data('color', nodeData.color || "gray");
          cyNode.data('icon', TEST_ICON_SVG); // REACT_ICON_SVG
        }
      });
      
      // Update existing edges direction if they changed
      graphData.edges.forEach((edgeData, index) => {
        const edgeId = `edge-${index}`;
        const cyEdge = instanceRef.current.$(`#${edgeId}`);
        if (cyEdge.length > 0) {
          const currentDirection = cyEdge.data('direction');
          const newDirection = edgeData.direction || "forward";
          
          if (currentDirection !== newDirection) {
            printDebug(`🔧 Updating edge direction for ${edgeId} from ${currentDirection} to ${newDirection}`);
            cyEdge.data('direction', newDirection);
          }
        }
      });
    }

    // Only destroy on unmount or when we actually need to recreate
    return () => {
      // Re-calculate if recreation is needed (same logic as above)
      const currentNodes = instanceRef.current ? instanceRef.current.nodes().length : 0;
      const currentEdges = instanceRef.current ? instanceRef.current.edges().length : 0;
      const willNeedRecreate = !instanceRef.current || 
        currentNodes !== graphData.nodes.length ||
        currentEdges !== graphData.edges.length;
      
      if (willNeedRecreate && instanceRef.current) {
        printDebug('🧹 Cleanup: destroying instance for recreation');
        instanceRef.current.destroy();
        instanceRef.current = null;
      } else {
        printDebug('🧹 Cleanup: keeping instance alive (no recreation needed)');
      }
    };
  }, [graphData, onCytoscapeInstanceReady]); // onNodeMove is handled via ref to avoid unnecessary re-runs

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      printDebug('🧹 Component unmounting - cleaning up Cytoscape instance');
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
    };
  }, []); // Empty dependency array = only run on mount/unmount

  // Handle fit operation when requested
  useEffect(() => {
    printDebug('🎯 Fit useEffect triggered, shouldFitOnNextRender:', shouldFitOnNextRender);
    if (shouldFitOnNextRender && instanceRef.current) {
      printDebug('🎯 Performing fit operation');
      // Use a small delay to ensure the graph has been fully rendered
      const timeoutId = setTimeout(() => {
        if (instanceRef.current) {
          printDebug('🎯 Executing fit with 50px padding');
          instanceRef.current.fit(instanceRef.current.nodes(), 50);
          if (onFitCompleted) {
            printDebug('✅ Calling onFitCompleted');
            onFitCompleted();
          }
        }
      }, 50);
      
      return () => clearTimeout(timeoutId);
    }
  }, [shouldFitOnNextRender, onFitCompleted]);

  return <div id="cy" ref={cyRef} style={{ 
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%", 
    height: "100%",
    outline: "none", // Remove focus outline - change to "1px solid white" to see when canvas has focus
  }}></div>;
};

export default CytoscapeGraph;
