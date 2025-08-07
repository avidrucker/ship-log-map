import React, { useState, useEffect, useCallback, useRef } from "react";
import CytoscapeGraph from "./CytoscapeGraph";
import defaultShipLogData from "./default_ship_log.json";
import { loadAndValidateRumorMapFromFile } from "./rumorMapValidation";
import GraphControls from "./GraphControls";
import NodeRenameModal from "./NodeRenameModal";
import CameraInfo from "./CameraInfo";
import ErrorDisplay from "./ErrorDisplay";

// Debug flag - set to false to disable all debug logging
const DEBUG = false;
const printDebug = (...args) => {
  if (DEBUG) console.log(...args);
};

function App() {
  // Clear localStorage to get fresh data with coordinates (remove after first load)
  // localStorage.removeItem("shipLog");
  
  const fileInputRef = useRef(null);
  const [loadError, setLoadError] = useState(null);
  
  const [graphData, setGraphData] = useState(() => {
    const saved = localStorage.getItem("shipLog");
    if (saved) {
      const parsedData = JSON.parse(saved);
      // Check if the saved data has coordinates, if not, merge with initial data
      const hasCoordinates = parsedData.nodes.every(node => 
        typeof node.x === 'number' && typeof node.y === 'number'
      );
      
      // Ensure all nodes have color property
      const migratedNodes = parsedData.nodes.map(node => ({
        ...node,
        color: node.color || "gray"
      }));
      
      if (hasCoordinates) {
        return { ...parsedData, nodes: migratedNodes };
      } else {
        // Merge saved data with initial graph to get coordinates
        const mergedNodes = migratedNodes.map(savedNode => {
          const initialNode = defaultShipLogData.nodes.find(n => n.id === savedNode.id);
          return {
            ...savedNode,
            x: initialNode?.x || 0,
            y: initialNode?.y || 0
          };
        });
        return { ...parsedData, nodes: mergedNodes };
      }
    }
    return defaultShipLogData;
  });

  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem("shipLogCamera");
    return saved ? JSON.parse(saved).zoom || 1 : 1;
  });
  
  const [cameraPosition, setCameraPosition] = useState(() => {
    const saved = localStorage.getItem("shipLogCamera");
    return saved ? JSON.parse(saved).position || { x: 0, y: 0 } : { x: 0, y: 0 };
  });

  const [shouldFitOnNextRender, setShouldFitOnNextRender] = useState(false);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [nodeSelectionOrder, setNodeSelectionOrder] = useState([]);
  const [renamingNodeId, setRenamingNodeId] = useState(null);
  const [renameInputValue, setRenameInputValue] = useState("");

  // Add debugging for state changes
  useEffect(() => {
    printDebug('🏠 App: zoomLevel changed to:', zoomLevel);
  }, [zoomLevel]);

  useEffect(() => {
    printDebug('🏠 App: cameraPosition changed to:', cameraPosition);
  }, [cameraPosition]);

  useEffect(() => {
    printDebug('🏠 App: shouldFitOnNextRender changed to:', shouldFitOnNextRender);
  }, [shouldFitOnNextRender]);

  useEffect(() => {
    localStorage.setItem("shipLog", JSON.stringify(graphData));
  }, [graphData]);

  // Save camera state to localStorage
  useEffect(() => {
    localStorage.setItem("shipLogCamera", JSON.stringify({
      zoom: zoomLevel,
      position: cameraPosition
    }));
  }, [zoomLevel, cameraPosition]);

  const handleNodeMove = useCallback((nodeId, newX, newY) => {
    printDebug('🏠 App: handleNodeMove called for node:', nodeId, 'new position:', newX, newY);
    setGraphData(prevData => {
      printDebug('🏠 App: Updating graphData state');
      return {
        ...prevData,
        nodes: prevData.nodes.map(node => 
          node.id === nodeId 
            ? { ...node, x: newX, y: newY }
            : node
        )
      };
    });
  }, []);

  const handleFitToView = useCallback(() => {
    const cy = document.querySelector("#cy")?._cy;
    if (cy) {
      cy.fit(cy.nodes(), 50); // Fit all nodes with 50px padding
    }
  }, []);

  const handleFitCompleted = useCallback(() => {
    printDebug('🏠 App: handleFitCompleted called, setting shouldFitOnNextRender to false');
    setShouldFitOnNextRender(false);
  }, []);

  const handleFileSelect = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoadError(null);
    
    try {
      const result = await loadAndValidateRumorMapFromFile(file);
      
      if (result.isValid) {
        // Load the new map data
        setGraphData(result.data);
        
        // Reset camera to initial state
        setZoomLevel(1);
        setCameraPosition({ x: 0, y: 0 });
        
        // Trigger fit on next render
        setShouldFitOnNextRender(true);
        
        // Clear selections - both React state and Cytoscape selection
        const cy = document.querySelector("#cy")?._cy;
        if (cy) {
          cy.elements().unselect();
        }
        setSelectedEdgeIds([]);
        setSelectedNodeIds([]);
        setNodeSelectionOrder([]);
        setRenamingNodeId(null);
        setRenameInputValue("");
      } else {
        setLoadError(`Invalid map file: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      setLoadError(`Failed to load file: ${error.message}`);
    }
    
    // Clear the input so the same file can be selected again
    event.target.value = '';
  }, []);

  const handleResetToInitial = useCallback(() => {
    // Reset graph data to initial state
    setGraphData(defaultShipLogData);
    
    // Reset camera to initial state (zoom 100%, center position)
    setZoomLevel(1);
    setCameraPosition({ x: 0, y: 0 });
    
    // Trigger fit on next render
    setShouldFitOnNextRender(true);
    
    // Clear any load errors and selections - both React state and Cytoscape selection
    setLoadError(null);
    const cy = document.querySelector("#cy")?._cy;
    if (cy) {
      cy.elements().unselect();
    }
    setSelectedEdgeIds([]);
    setSelectedNodeIds([]);
    setNodeSelectionOrder([]);
    setRenamingNodeId(null);
    setRenameInputValue("");
  }, []);

  const clearError = useCallback(() => {
    setLoadError(null);
  }, []);

  const handleEdgeSelectionChange = useCallback((edgeIds) => {
    printDebug('🏠 App: Edge selection changed to:', edgeIds);
    setSelectedEdgeIds(edgeIds);
  }, []);

  const handleDeleteSelectedEdges = useCallback((edgeIds) => {
    printDebug('🏠 App: Deleting edges:', edgeIds);
    
    setGraphData(prevData => {
      const updatedEdges = prevData.edges.filter((edge, index) => {
        const edgeId = `edge-${index}`;
        return !edgeIds.includes(edgeId);
      });
      
      return {
        ...prevData,
        edges: updatedEdges
      };
    });
    
    // Clear selection after deletion - both React state and Cytoscape selection
    const cy = document.querySelector("#cy")?._cy;
    if (cy) {
      cy.edges().unselect();
    }
    setSelectedEdgeIds([]);
  }, []);

  const handleDeleteSelectedNodes = useCallback((nodeIds) => {
    printDebug('🏠 App: Deleting nodes:', nodeIds);
    
    setGraphData(prevData => {
      // Remove the selected nodes
      const updatedNodes = prevData.nodes.filter(node => !nodeIds.includes(node.id));
      
      // Remove all edges that connect to the deleted nodes
      const updatedEdges = prevData.edges.filter(edge => 
        !nodeIds.includes(edge.source) && !nodeIds.includes(edge.target)
      );
      
      printDebug('🏠 App: Removed', prevData.nodes.length - updatedNodes.length, 'nodes and', prevData.edges.length - updatedEdges.length, 'edges');
      
      return {
        ...prevData,
        nodes: updatedNodes,
        edges: updatedEdges
      };
    });
    
    // Clear selection after deletion - both React state and Cytoscape selection
    const cy = document.querySelector("#cy")?._cy;
    if (cy) {
      cy.nodes().unselect();
    }
    setSelectedNodeIds([]);
    setNodeSelectionOrder([]);
  }, []);

  const handleNodeSelectionChange = useCallback((nodeIds, selectionOrder) => {
    printDebug('🏠 App: Node selection changed to:', nodeIds, 'Order:', selectionOrder);
    setSelectedNodeIds(nodeIds);
    setNodeSelectionOrder(selectionOrder);
  }, []);

  const handleConnectSelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 2 && nodeSelectionOrder.length === 2) {
      // Use selection order: first selected -> second selected
      const [sourceId, targetId] = nodeSelectionOrder;
      printDebug('🏠 App: Connecting nodes in selection order:', sourceId, '->', targetId);
      
      setGraphData(prevData => {
        // Check if edge already exists
        const edgeExists = prevData.edges.some(edge => 
          edge.source === sourceId && edge.target === targetId
        );
        
        if (!edgeExists) {
          const newEdge = {
            source: sourceId,
            target: targetId,
            direction: "forward"
          };
          
          return {
            ...prevData,
            edges: [...prevData.edges, newEdge]
          };
        }
        
        return prevData; // No change if edge already exists
      });
      
      // Clear node selection after connecting - both React state and Cytoscape selection
      const cy = document.querySelector("#cy")?._cy;
      if (cy) {
        cy.nodes().unselect();
      }
      setSelectedNodeIds([]);
      setNodeSelectionOrder([]);
    }
  }, [selectedNodeIds, nodeSelectionOrder]);

  const handleEdgeDirectionChange = useCallback((edgeId, newDirection) => {
    printDebug('🏠 App: Changing edge direction:', edgeId, 'to:', newDirection);
    
    setGraphData(prevData => {
      // Find the edge index from the edge ID
      const edgeIndex = parseInt(edgeId.replace('edge-', ''));
      
      if (edgeIndex >= 0 && edgeIndex < prevData.edges.length) {
        const updatedEdges = [...prevData.edges];
        updatedEdges[edgeIndex] = {
          ...updatedEdges[edgeIndex],
          direction: newDirection
        };
        
        return {
          ...prevData,
          edges: updatedEdges
        };
      }
      
      return prevData; // No change if edge not found
    });
  }, []);

  const handleNodeSizeChange = useCallback((nodeId, newSize) => {
    printDebug('🏠 App: Changing node size:', nodeId, 'to:', newSize);
    
    setGraphData(prevData => {
      const updatedNodes = prevData.nodes.map(node => 
        node.id === nodeId 
          ? { ...node, size: newSize }
          : node
      );
      
      return {
        ...prevData,
        nodes: updatedNodes
      };
    });
  }, []);

  const handleStartRename = useCallback((nodeId) => {
    printDebug('🏠 App: Starting rename for node:', nodeId);
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (node) {
      setRenamingNodeId(nodeId);
      setRenameInputValue(node.title);
    }
  }, [graphData.nodes]);

  const handleCancelRename = useCallback(() => {
    printDebug('🏠 App: Cancelling rename');
    setRenamingNodeId(null);
    setRenameInputValue("");
  }, []);

  // Handle mouse-downs outside the rename modal to cancel renaming
  const handleBackgroundMouseDown = useCallback((event) => {
    // Only cancel if we're currently renaming and the mouse-down is outside the rename modal
    if (renamingNodeId) {
      // Check if the mouse-down target is the canvas or a parent element, not the rename modal
      const renameModal = event.target.closest('[data-rename-modal]');
      if (!renameModal) {
        printDebug('🏠 App: Background mouse-down detected, cancelling rename');
        handleCancelRename();
      }
    }
  }, [renamingNodeId, handleCancelRename]);

  const handleSubmitRename = useCallback(() => {
    if (!renamingNodeId || !renameInputValue.trim()) {
      handleCancelRename();
      return;
    }

    const newTitle = renameInputValue.trim();
    printDebug('🏠 App: Submitting rename for node:', renamingNodeId, 'new title:', newTitle);

    // Find a unique ID based on the new title
    let baseId = newTitle.replace(/[^a-zA-Z0-9]/g, ''); // Remove special characters
    if (!baseId) baseId = 'node'; // Fallback if title has no valid characters
    
    let counter = 1;
    let uniqueId = baseId;
    
    // Keep incrementing until we find a unique ID (excluding the current node being renamed)
    while (graphData.nodes.some(node => node.id === uniqueId && node.id !== renamingNodeId)) {
      uniqueId = `${baseId}${counter}`;
      counter++;
    }
    
    printDebug('🏠 App: Generated unique ID:', uniqueId);

    setGraphData(prevData => {
      const updatedNodes = prevData.nodes.map(node => 
        node.id === renamingNodeId 
          ? { ...node, id: uniqueId, title: newTitle }
          : node
      );
      
      // Also update any edges that reference the old node ID
      const updatedEdges = prevData.edges.map(edge => ({
        ...edge,
        source: edge.source === renamingNodeId ? uniqueId : edge.source,
        target: edge.target === renamingNodeId ? uniqueId : edge.target
      }));
      
      return {
        ...prevData,
        nodes: updatedNodes,
        edges: updatedEdges
      };
    });

    // Clear selections since the node ID changed
    const cy = document.querySelector("#cy")?._cy;
    if (cy) {
      cy.elements().unselect();
    }
    setSelectedNodeIds([]);
    setNodeSelectionOrder([]);
    
    // Clear rename state
    setRenamingNodeId(null);
    setRenameInputValue("");
  }, [renamingNodeId, renameInputValue, graphData.nodes, handleCancelRename]);

  const handleCreateNode = useCallback(() => {
    printDebug('🏠 App: Creating new node');
    
    // Find a unique ID and title
    let counter = 1;
    let uniqueId;
    let uniqueTitle;
    
    do {
      uniqueId = `untitled${counter}`;
      uniqueTitle = `untitled${counter}`;
      counter++;
    } while (graphData.nodes.some(node => node.id === uniqueId || node.title === uniqueTitle));
    
    printDebug('🏠 App: Found unique ID/title:', uniqueId);
    
    // Get the current camera center from Cytoscape instance
    const cy = document.querySelector("#cy")?._cy;
    let centerX = 0;
    let centerY = 0;
    
    if (cy) {
      // Get the current viewport center in world coordinates
      const extent = cy.extent();
      centerX = (extent.x1 + extent.x2) / 2;
      centerY = (extent.y1 + extent.y2) / 2;
      printDebug('🏠 App: Calculated viewport center from Cytoscape:', centerX, centerY);
    } else {
      // Fallback to stored camera position if Cytoscape instance not available
      centerX = cameraPosition.x;
      centerY = cameraPosition.y;
      printDebug('🏠 App: Using fallback camera position:', centerX, centerY);
    }
    
    printDebug('🏠 App: Creating node at center position:', centerX, centerY);
    
    // Create new node
    const newNode = {
      id: uniqueId,
      title: uniqueTitle,
      size: "regular",
      color: "gray",
      x: Math.round(centerX),
      y: Math.round(centerY)
    };
    
    setGraphData(prevData => ({
      ...prevData,
      nodes: [...prevData.nodes, newNode]
    }));
    
    printDebug('🏠 App: Node created successfully:', newNode);
  }, [graphData, cameraPosition]);

  const exportMap = () => {
    // Grab updated positions from Cytoscape instance (via DOM event)
    const cy = document.querySelector("#cy")._cy;
    const updatedNodes = cy.nodes().map(n => ({
      ...graphData.nodes.find(node => node.id === n.id()),
      x: n.position("x"),
      y: n.position("y")
    }));
    const updatedGraph = { ...graphData, nodes: updatedNodes };

    const blob = new Blob([JSON.stringify(updatedGraph, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "ship_log_export.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleNodeColorChange = useCallback((nodeIds, newColor) => {
    printDebug('🏠 App: Changing node color for:', nodeIds, 'to:', newColor);
    
    setGraphData(prevData => {
      const updatedNodes = prevData.nodes.map(node => 
        nodeIds.includes(node.id)
          ? { ...node, color: newColor }
          : node
      );
      
      return {
        ...prevData,
        nodes: updatedNodes
      };
    });
  }, []);

  // Helper function to check if two nodes are already connected
  const areNodesConnected = useCallback((sourceId, targetId) => {
    return graphData.edges.some(edge => 
      (edge.source === sourceId && edge.target === targetId) ||
      (edge.source === targetId && edge.target === sourceId)
    );
  }, [graphData.edges]);

  return (
    <div 
      style={{ 
        position: "fixed", 
        top: 0, 
        left: 0, 
        width: "100%", 
        height: "100%", 
        overflow: "hidden" 
      }}
      onMouseDown={handleBackgroundMouseDown}
    >
      <GraphControls
        selectedNodes={selectedNodeIds}
        selectedEdges={selectedEdgeIds}
        onCreateNode={handleCreateNode}
        onDeleteSelectedNodes={handleDeleteSelectedNodes}
        onDeleteSelectedEdges={handleDeleteSelectedEdges}
        onRenameNode={handleStartRename}
        onConnectNodes={handleConnectSelectedNodes}
        onExportMap={exportMap}
        onImportFile={handleFileSelect}
        onResetMap={handleResetToInitial}
        onFitToView={handleFitToView}
        fileInputRef={fileInputRef}
        onNodeColorChange={handleNodeColorChange}
        areNodesConnected={areNodesConnected}
        renamingNodeId={renamingNodeId}
      />

      <NodeRenameModal
        renamingNodeId={renamingNodeId}
        renameInputValue={renameInputValue}
        setRenameInputValue={setRenameInputValue}
        onSubmitRename={handleSubmitRename}
        onCancelRename={handleCancelRename}
      />

      <CameraInfo
        zoom={zoomLevel}
        pan={cameraPosition}
        selectedNodeIds={selectedNodeIds}
        selectedEdgeIds={selectedEdgeIds}
      />

      <ErrorDisplay error={loadError} onClearError={clearError} />

      <CytoscapeGraph 
        graphData={graphData} 
        onNodeMove={handleNodeMove}
        onZoomChange={setZoomLevel}
        onCameraMove={setCameraPosition}
        initialZoom={zoomLevel}
        initialCameraPosition={cameraPosition}
        shouldFitOnNextRender={shouldFitOnNextRender}
        onFitCompleted={handleFitCompleted}
        onEdgeSelectionChange={handleEdgeSelectionChange}
        onDeleteSelectedEdges={handleDeleteSelectedEdges}
        onNodeSelectionChange={handleNodeSelectionChange}
        onEdgeDirectionChange={handleEdgeDirectionChange}
        onDeleteSelectedNodes={handleDeleteSelectedNodes}
        onNodeSizeChange={handleNodeSizeChange}
        onNodeColorChange={handleNodeColorChange}
      />
    </div>
  );
}

export default App;
