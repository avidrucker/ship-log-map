import React, { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import cytoscapeStyles from "./cytoscapeStyles";

const CytoscapeGraph = ({ graphData, onNodeMove, onZoomChange, onCameraMove, initialZoom, initialCameraPosition }) => {
  const cyRef = useRef(null);
  const instanceRef = useRef(null); // To prevent multiple Cytoscape initializations
  const currentCameraRef = useRef({ 
    zoom: initialZoom || 1, 
    pan: { x: -(initialCameraPosition?.x || 0), y: -(initialCameraPosition?.y || 0) } 
  }); // Store current camera state
  
  // Use refs for callbacks to avoid dependency issues
  const onZoomChangeRef = useRef(onZoomChange);
  const onCameraMoveRef = useRef(onCameraMove);
  
  // Update refs when callbacks change
  onZoomChangeRef.current = onZoomChange;
  onCameraMoveRef.current = onCameraMove;

  // Initialize Cytoscape instance only once or when structure changes
  useEffect(() => {
    if (!cyRef.current) return;  // Wait until div is mounted
    
    // Only recreate if instance doesn't exist or if the number of nodes/edges changed
    const needsRecreate = !instanceRef.current || 
      instanceRef.current.nodes().length !== graphData.nodes.length ||
      instanceRef.current.edges().length !== graphData.edges.length;

    if (needsRecreate) {
      // Store current camera position before destroying
      if (instanceRef.current) {
        currentCameraRef.current.zoom = instanceRef.current.zoom();
        currentCameraRef.current.pan = instanceRef.current.pan();
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
          fit: true,
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
        instanceRef.current.zoom(currentCameraRef.current.zoom);
        instanceRef.current.pan(currentCameraRef.current.pan);
      }

      // Expose the Cytoscape instance to the DOM for the export function
      if (cyRef.current) {
        cyRef.current._cy = instanceRef.current;
      }

      // Add event listener for when node dragging ends
      instanceRef.current.on('free', 'node', (event) => {
        const node = event.target;
        const position = node.position();
        const nodeId = node.id();
        
        // Snap to integer coordinates
        const snappedX = Math.round(position.x);
        const snappedY = Math.round(position.y);
        
        // Update the node's position to snapped coordinates
        node.position({ x: snappedX, y: snappedY });
        
        // Update the node's data with new coordinates
        node.data('x', snappedX);
        node.data('y', snappedY);
        
        // Update the label with new coordinates
        const originalTitle = graphData.nodes.find(n => n.id === nodeId)?.title || node.data('label').split('\n')[0];
        node.data('label', `${originalTitle}\n(${snappedX}, ${snappedY})`);
        
        // Notify parent component if callback is provided
        if (onNodeMove) {
          onNodeMove(nodeId, snappedX, snappedY);
        }
      });

      // Add event listeners for zoom and camera changes
      const updateCameraInfo = () => {
        if (onZoomChangeRef.current) {
          onZoomChangeRef.current(instanceRef.current.zoom());
        }
        if (onCameraMoveRef.current) {
          const pan = instanceRef.current.pan();
          onCameraMoveRef.current({ x: -pan.x, y: -pan.y });
        }
      };

      instanceRef.current.on('zoom', updateCameraInfo);
      instanceRef.current.on('pan', updateCameraInfo);
      
      // Don't call updateCameraInfo initially to avoid infinite loop
      // The parent component already has the correct initial values
    } else {
      // Just update existing nodes without recreating the instance
      graphData.nodes.forEach(nodeData => {
        const cyNode = instanceRef.current.$(`#${nodeData.id}`);
        if (cyNode.length > 0) {
          // Update position if it changed
          const currentPos = cyNode.position();
          if (currentPos.x !== nodeData.x || currentPos.y !== nodeData.y) {
            cyNode.position({ x: nodeData.x, y: nodeData.y });
          }
          
          // Update data and label
          cyNode.data('x', nodeData.x);
          cyNode.data('y', nodeData.y);
          cyNode.data('label', `${nodeData.title}\n(${nodeData.x}, ${nodeData.y})`);
          cyNode.data('state', nodeData.state);
        }
      });
    }

    return () => {
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
    };
  }, [graphData, onNodeMove]);

  return <div id="cy" ref={cyRef} style={{ 
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%", 
    height: "100%"
  }}></div>;
};

export default CytoscapeGraph;
