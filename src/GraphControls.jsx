import React from "react";
import NodeColorPicker from "./NodeColorPicker";

function GraphControls({
  selectedNodes,
  selectedEdges,
  onCreateNode,
  onDeleteSelectedNodes,
  onDeleteSelectedEdges,
  onEditSelected,
  onConnectNodes,
  onExportMap,
  onImportFile,
  onResetMap,
  onFitToView,
  fileInputRef,
  onNodeColorChange,
  areNodesConnected
}) {
  const canConnect = selectedNodes.length === 2 && !areNodesConnected(selectedNodes[0], selectedNodes[1]);

  return (
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
        onChange={onImportFile}
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
        onClick={onExportMap}
        title="Export Map JSON"
      >
        Export
      </button>
      
      <button
        style={{
          padding: "8px 12px",
          background: "#1976d2",
          color: "#fff",
          border: "1px solid #0d47a1",
          cursor: "pointer"
        }}
        onClick={() => fileInputRef.current?.click()}
        title="Load Map JSON"
      >
        Load
      </button>
      
      <button
        style={{
          padding: "8px 12px",
          background: "#222",
          color: "#fff",
          border: "1px solid #444",
          cursor: "pointer"
        }}
        onClick={onFitToView}
        title="Fit Map to Viewport"
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
        onClick={onResetMap}
        title="Reset Map to Initial State"
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
        onClick={onCreateNode}
        title="Add New Node"
      >
        Add
      </button>
      
      {selectedEdges.length > 0 && (
        <button
          style={{
            padding: "8px 12px",
            background: "#ff5722",
            color: "#fff",
            border: "1px solid #d84315",
            cursor: "pointer",
            fontWeight: "bold"
          }}
          onClick={() => onDeleteSelectedEdges(selectedEdges)}
          title={`Delete ${selectedEdges.length} Edge${selectedEdges.length > 1 ? 's' : ''}`}
        >
          Delete
        </button>
      )}
      
      {(selectedNodes.length === 1 || selectedEdges.length === 1) && (
        <button
          style={{
            padding: "8px 12px",
            background: "#9c27b0",
            color: "#fff",
            border: "1px solid #6a1b9a",
            cursor: "pointer",
            fontWeight: "bold"
          }}
          onClick={onEditSelected}
          title="Edit Label/Notes"
        >
          Edit
        </button>
      )}
      
      {selectedNodes.length > 0 && (
        <button
          style={{
            padding: "8px 12px",
            background: "#e91e63",
            color: "#fff",
            border: "1px solid #ad1457",
            cursor: "pointer",
            fontWeight: "bold"
          }}
          onClick={() => onDeleteSelectedNodes(selectedNodes)}
          title={`Delete ${selectedNodes.length} Node${selectedNodes.length > 1 ? 's' : ''}`}
        >
          Delete
        </button>
      )}
      
      {canConnect && (
        <button
          style={{
            padding: "8px 12px",
            background: "#4caf50",
            color: "#fff",
            border: "1px solid #388e3c",
            cursor: "pointer",
            fontWeight: "bold"
          }}
          onClick={onConnectNodes}
        >
          Connect
        </button>
      )}
      
      {selectedNodes.length > 0 && (
        <NodeColorPicker
          selectedNodeIds={selectedNodes}
          onNodeColorChange={onNodeColorChange}
        />
      )}
    </div>
  );
}

export default GraphControls;
