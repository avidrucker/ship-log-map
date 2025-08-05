import React, { useState, useEffect, useCallback } from "react";
import CytoscapeGraph from "./CytoscapeGraph";
import initialGraph from "./ShipLogData";

function App() {
  // Clear localStorage to get fresh data with coordinates (remove after first load)
  // localStorage.removeItem("shipLog");
  
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
          const initialNode = initialGraph.nodes.find(n => n.id === savedNode.id);
          return {
            ...savedNode,
            x: initialNode?.x || 0,
            y: initialNode?.y || 0
          };
        });
        return { ...parsedData, nodes: mergedNodes };
      }
    }
    return initialGraph;
  });

  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem("shipLogCamera");
    return saved ? JSON.parse(saved).zoom || 1 : 1;
  });
  
  const [cameraPosition, setCameraPosition] = useState(() => {
    const saved = localStorage.getItem("shipLogCamera");
    return saved ? JSON.parse(saved).position || { x: 0, y: 0 } : { x: 0, y: 0 };
  });

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
    setGraphData(prevData => ({
      ...prevData,
      nodes: prevData.nodes.map(node => 
        node.id === nodeId 
          ? { ...node, x: newX, y: newY }
          : node
      )
    }));
  }, []);

  const handleFitToView = useCallback(() => {
    const cy = document.querySelector("#cy")?._cy;
    if (cy) {
      cy.fit(cy.nodes(), 50); // Fit all nodes with 50px padding
    }
  }, []);

  const exportMap = () => {
    // Grab updated positions from Cytoscape instance (via DOM event)
    const cy = document.querySelector("#cy")._cy; // We'll set an id on the container later
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
            background: "#222",
            color: "#fff",
            border: "1px solid #444",
            cursor: "pointer"
          }}
          onClick={handleFitToView}
        >
          Fit
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

      <CytoscapeGraph 
        graphData={graphData} 
        onNodeMove={handleNodeMove}
        onZoomChange={setZoomLevel}
        onCameraMove={setCameraPosition}
        initialZoom={zoomLevel}
        initialCameraPosition={cameraPosition}
      />
    </div>
  );
}

export default App;
