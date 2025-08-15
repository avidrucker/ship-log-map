import React, { useState, useCallback } from "react";

function CameraInfo({ zoom, pan, selectedNodeIds, selectedEdgeIds, mode, mapName, onMapNameChange }) {
  const [isEditingMapName, setIsEditingMapName] = useState(false);
  const [tempMapName, setTempMapName] = useState(mapName);

  const handleStartEditMapName = useCallback(() => {
    setTempMapName(mapName);
    setIsEditingMapName(true);
  }, [mapName]);

  const handleSaveMapName = useCallback(() => {
    const cleanName = tempMapName.trim();
    if (cleanName && cleanName !== mapName) {
      onMapNameChange(cleanName);
    }
    setIsEditingMapName(false);
  }, [tempMapName, mapName, onMapNameChange]);

  const handleCancelEditMapName = useCallback(() => {
    setTempMapName(mapName);
    setIsEditingMapName(false);
  }, [mapName]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSaveMapName();
    } else if (e.key === 'Escape') {
      handleCancelEditMapName();
    }
  }, [handleSaveMapName, handleCancelEditMapName]);
  return (
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
      <div style={{ 
        color: mode === 'editing' ? "#4caf50" : "#2196f3",
        fontWeight: "bold",
        marginBottom: "8px",
        textTransform: "uppercase",
        fontSize: "14px"
      }}>
        {mode === 'editing' ? 'Editing' : 'Playing'}
      </div>
      
      {/* Map Name Field */}
      <div style={{ marginBottom: "8px" }}>
        <div style={{ color: "#888", fontSize: "10px", marginBottom: "2px" }}>Map Name:</div>
        {isEditingMapName ? (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <input
              type="text"
              value={tempMapName}
              onChange={(e) => setTempMapName(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                background: "#333",
                color: "#fff",
                border: "1px solid #4caf50",
                padding: "2px 4px",
                borderRadius: "2px",
                fontSize: "11px",
                fontFamily: "monospace",
                width: "100px"
              }}
              autoFocus
            />
            <button
              onClick={handleSaveMapName}
              style={{
                background: "#4caf50",
                color: "#fff",
                border: "none",
                borderRadius: "2px",
                padding: "2px 4px",
                cursor: "pointer",
                fontSize: "10px"
              }}
            >
              ✓
            </button>
            <button
              onClick={handleCancelEditMapName}
              style={{
                background: "#666",
                color: "#fff",
                border: "none",
                borderRadius: "2px",
                padding: "2px 4px",
                cursor: "pointer",
                fontSize: "10px"
              }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div 
            onClick={handleStartEditMapName}
            style={{
              cursor: "pointer",
              textDecoration: "underline dotted",
              color: "#4fc3f7",
              fontSize: "11px"
            }}
            title="Click to edit map name"
          >
            {mapName}
          </div>
        )}
      </div>
      
      <div>Zoom: {(zoom * 100).toFixed(0)}%</div>
      <div>Camera:<br/>({Math.round(pan.x)},{Math.round(pan.y)})</div>
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
  );
}

export default CameraInfo;
