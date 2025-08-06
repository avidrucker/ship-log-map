import React, { useState, useEffect, useCallback, useRef } from "react";
import CytoscapeGraph from "./CytoscapeGraph";
import defaultShipLogData from "./default_ship_log.json";
import { loadAndValidateRumorMapFromFile } from "./rumorMapValidation";

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
      
      if (hasCoordinates) {
        return parsedData;
      } else {
        // Merge saved data with initial graph to get coordinates
        const mergedNodes = parsedData.nodes.map(savedNode => {
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

  const handleLoadMap = useCallback(() => {
    fileInputRef.current?.click();
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
      <div style={{
        position: "absolute",
        top: "10px",
        right: "10px",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
        
        <button
          style={{
            padding: "8px 12px",
            background: "#222",
            color: "#fff",
            border: "1px solid #444",
            cursor: "pointer"
          }}
          onClick={exportMap}
        >
          Export Map JSON
        </button>
        
        <button
          style={{
            padding: "8px 12px",
            background: "#1976d2",
            color: "#fff",
            border: "1px solid #0d47a1",
            cursor: "pointer"
          }}
          onClick={handleLoadMap}
        >
          Load Map JSON
        </button>
        
        <button
          style={{
            padding: "8px 12px",
            background: "#222",
            color: "#fff",
            border: "1px solid #444",
            cursor: "pointer"
          }}
          onClick={handleFitToView}
        >
          Fit
        </button>
        
        <button
          style={{
            padding: "8px 12px",
            background: "#d32f2f",
            color: "#fff",
            border: "1px solid #b71c1c",
            cursor: "pointer"
          }}
          onClick={handleResetToInitial}
        >
          Reset
        </button>
        
        <button
          style={{
            padding: "8px 12px",
            background: "#4caf50",
            color: "#fff",
            border: "1px solid #388e3c",
            cursor: "pointer"
          }}
          onClick={handleCreateNode}
        >
          Create Node
        </button>
        
        {selectedEdgeIds.length > 0 && (
          <button
            style={{
              padding: "8px 12px",
              background: "#ff5722",
              color: "#fff",
              border: "1px solid #d84315",
              cursor: "pointer",
              fontWeight: "bold"
            }}
            onClick={() => handleDeleteSelectedEdges(selectedEdgeIds)}
          >
            Delete {selectedEdgeIds.length} Edge{selectedEdgeIds.length > 1 ? 's' : ''}
          </button>
        )}
        
        {selectedNodeIds.length === 1 && !renamingNodeId && (
          <button
            style={{
              padding: "8px 12px",
              background: "#9c27b0",
              color: "#fff",
              border: "1px solid #6a1b9a",
              cursor: "pointer",
              fontWeight: "bold"
            }}
            onClick={() => handleStartRename(selectedNodeIds[0])}
          >
            Rename Node
          </button>
        )}
        
        {selectedNodeIds.length > 0 && (
          <button
            style={{
              padding: "8px 12px",
              background: "#e91e63",
              color: "#fff",
              border: "1px solid #ad1457",
              cursor: "pointer",
              fontWeight: "bold"
            }}
            onClick={() => handleDeleteSelectedNodes(selectedNodeIds)}
          >
            Delete {selectedNodeIds.length} Node{selectedNodeIds.length > 1 ? 's' : ''}
          </button>
        )}
        
        {selectedNodeIds.length === 2 && nodeSelectionOrder.length === 2 && (
          <button
            style={{
              padding: "8px 12px",
              background: "#4caf50",
              color: "#fff",
              border: "1px solid #388e3c",
              cursor: "pointer",
              fontWeight: "bold"
            }}
            onClick={handleConnectSelectedNodes}
          >
            Connect: {nodeSelectionOrder[0]} → {nodeSelectionOrder[1]}
          </button>
        )}
      </div>

      {renamingNodeId && (
        <div 
          data-rename-modal="true"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1001,
            background: "rgba(0, 0, 0, 0.9)",
            color: "#fff",
            padding: "15px",
            borderRadius: "8px",
            border: "2px solid #9c27b0",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            minWidth: "300px"
          }}
        >
          <div style={{ fontWeight: "bold", textAlign: "center" }}>
            Rename Node: {renamingNodeId}
          </div>
          
          <input
            type="text"
            value={renameInputValue}
            onChange={(e) => setRenameInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSubmitRename();
              } else if (e.key === 'Escape') {
                handleCancelRename();
              }
            }}
            style={{
              padding: "8px",
              fontSize: "14px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              outline: "none"
            }}
            placeholder="Enter new node name..."
            autoFocus
          />
          
          <div style={{
            display: "flex",
            gap: "10px",
            justifyContent: "center"
          }}>
            <button
              onClick={handleSubmitRename}
              style={{
                padding: "6px 12px",
                background: "#4caf50",
                color: "#fff",
                border: "1px solid #388e3c",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px"
              }}
            >
              Rename
            </button>
            
            <button
              onClick={handleCancelRename}
              style={{
                padding: "6px 12px",
                background: "#f44336",
                color: "#fff",
                border: "1px solid #d32f2f",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px"
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{
        position: "absolute",
        top: "10px",
        left: "10px",
        zIndex: 1000,
        background: "rgba(0, 0, 0, 0.7)",
        color: "#fff",
        padding: "10px",
        borderRadius: "5px",
        fontFamily: "monospace",
        fontSize: "12px"
      }}>
        <div>Zoom: {(zoomLevel * 100).toFixed(0)}%</div>
        <div>Camera: ({Math.round(cameraPosition.x)}, {Math.round(cameraPosition.y)})</div>
        {selectedNodeIds.length > 0 && (
          <div style={{ color: "#4fc3f7" }}>
            Nodes: {selectedNodeIds.length} selected
          </div>
        )}
        {selectedEdgeIds.length > 0 && (
          <div style={{ color: "#ff6b6b" }}>
            Edges: {selectedEdgeIds.length} selected
          </div>
        )}
      </div>

      {loadError && (
        <div style={{
          position: "absolute",
          bottom: "10px",
          left: "10px",
          right: "10px",
          zIndex: 1000,
          background: "rgba(211, 47, 47, 0.9)",
          color: "#fff",
          padding: "10px",
          borderRadius: "5px",
          fontFamily: "sans-serif",
          fontSize: "14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "10px"
        }}>
          <div style={{ flex: 1 }}>
            <strong>Load Error:</strong> {loadError}
          </div>
          <button
            onClick={clearError}
            style={{
              background: "transparent",
              border: "1px solid #fff",
              color: "#fff",
              padding: "2px 8px",
              cursor: "pointer",
              borderRadius: "3px",
              fontSize: "12px"
            }}
          >
            ×
          </button>
        </div>
      )}

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
      />
    </div>
  );
}

export default App;
