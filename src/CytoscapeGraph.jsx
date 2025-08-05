import React, { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import cytoscapeStyles from "./cytoscapeStyles";

// Debug flag - set to false to disable all debug logging
const DEBUG = false;
const printDebug = (...args) => {
  if (DEBUG) console.log(...args);
};

const CytoscapeGraph = ({ 
  graphData, 
  onNodeMove, 
  onZoomChange, 
  onCameraMove, 
  initialZoom, 
  initialCameraPosition, 
  shouldFitOnNextRender, 
  onFitCompleted 
}) => {
  const cyRef = useRef(null);
  const instanceRef = useRef(null); // To prevent multiple Cytoscape initializations
  const currentCameraRef = useRef({ 
    zoom: initialZoom || 1, 
    pan: { x: -(initialCameraPosition?.x || 0), y: -(initialCameraPosition?.y || 0) } 
  }); // Store current camera state
  
  // Use refs for callbacks to avoid dependency issues
  const onZoomChangeRef = useRef(onZoomChange);
  const onCameraMoveRef = useRef(onCameraMove);
  const onNodeMoveRef = useRef(onNodeMove);
  
  // Update refs when callbacks change
  onZoomChangeRef.current = onZoomChange;
  onCameraMoveRef.current = onCameraMove;
  onNodeMoveRef.current = onNodeMove;

  // Initialize Cytoscape instance only once or when structure changes
  useEffect(() => {
    printDebug('🔄 Main useEffect triggered - graphData changed');
    if (!cyRef.current) return;  // Wait until div is mounted
    
    // Only recreate if instance doesn't exist or if the number of nodes/edges changed
    const currentNodeCount = instanceRef.current ? instanceRef.current.nodes().length : 0;
    const currentEdgeCount = instanceRef.current ? instanceRef.current.edges().length : 0;
    const newNodeCount = graphData.nodes.length;
    const newEdgeCount = graphData.edges.length;
    
    const needsRecreate = !instanceRef.current || 
      currentNodeCount !== newNodeCount ||
      currentEdgeCount !== newEdgeCount;

    printDebug('🔍 Recreation check:', {
      hasInstance: !!instanceRef.current,
      currentNodeCount,
      newNodeCount,
      currentEdgeCount,
      newEdgeCount,
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
            label: `${n.title}\n(${n.x}, ${n.y})`, 
            state: n.state, 
            x: n.x, 
            y: n.y 
          },
          position: { x: n.x, y: n.y }
        })),
        ...graphData.edges.map(e => ({
          data: { source: e.source, target: e.target, type: e.type }
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
        // Enable node dragging
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: false,
        selectionType: 'single',
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
        node.data('label', `${originalTitle}\n(${snappedX}, ${snappedY})`);
        
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
          cyNode.data('label', `${nodeData.title}\n(${nodeData.x}, ${nodeData.y})`);
          cyNode.data('state', nodeData.state);
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
  }, [graphData]); // onNodeMove is handled via ref to avoid unnecessary re-runs

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
    height: "100%"
  }}></div>;
};

export default CytoscapeGraph;
