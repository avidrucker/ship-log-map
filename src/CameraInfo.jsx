import React from "react";

function CameraInfo({ zoom, pan, selectedNodeIds, selectedEdgeIds }) {
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
