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
    
    // Clear any load errors
    setLoadError(null);
  }, []);

  const clearError = useCallback(() => {
    setLoadError(null);
  }, []);

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
    <div style={{ 
      position: "fixed", 
      top: 0, 
      left: 0, 
      width: "100%", 
      height: "100%", 
      overflow: "hidden" 
    }}>
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
      </div>

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
      />
    </div>
  );
}

export default App;
