import React from "react";
import NodeColorPicker from "./NodeColorPicker";
import { printDebug } from "./utils/debug.js";
import { DEV_MODE } from "./config/features";

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
  onNewMap,
  onFitToView,
  fileInputRef,
  onNodeColorChange,
  areNodesConnected,
  mode,
  onModeToggle,
  onOpenDebugModal,
  onUndo,
  canUndo,
  showNoteCountOverlay,
  onToggleNoteCountOverlay
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
          background: showNoteCountOverlay ? "#4caf50" : "#666",
          color: "#fff",
          border: `1px solid ${showNoteCountOverlay ? "#388e3c" : "#555"}`,
          cursor: "pointer"
        }}
        onClick={() => {
          printDebug('🔥 [BUTTON] Notes button clicked! Current state:', showNoteCountOverlay);
          onToggleNoteCountOverlay();
        }}
        title={`${showNoteCountOverlay ? 'Hide' : 'Show'} Note Count Overlay`}
      >
        Notes ({showNoteCountOverlay ? 'ON' : 'OFF'})
      </button>
      
      <button
        style={{
          padding: "8px 12px",
          background: canUndo ? "#ff9800" : "#666",
          color: canUndo ? "#fff" : "#999",
          border: `1px solid ${canUndo ? "#f57c00" : "#555"}`,
          cursor: canUndo ? "pointer" : "not-allowed",
          opacity: canUndo ? 1 : 0.6
        }}
        onClick={canUndo ? onUndo : undefined}
        disabled={!canUndo}
        title={canUndo ? "Undo last action" : "No action to undo"}
      >
        Undo
      </button>
      
      {mode === 'editing' && (
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
      )}
      
      {mode === 'editing' && (
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
      )}
      
      {mode === 'editing' && (
        <button
          style={{
            padding: "8px 12px",
            background: "#9e9e9e",
            color: "#fff",
            border: "1px solid #757575",
            cursor: "pointer"
          }}
          onClick={onNewMap}
          title="Create New Empty Map"
        >
          New
        </button>
      )}
      
      <button
        style={{
          padding: "8px 12px",
          background: mode === 'editing' ? "#ff9800" : "#2196f3",
          color: "#fff",
          border: `1px solid ${mode === 'editing' ? "#f57c00" : "#1976d2"}`,
          cursor: "pointer",
          fontWeight: "bold"
        }}
        onClick={onModeToggle}
        title={`Switch to ${mode === 'editing' ? 'Playing' : 'Editing'} Mode`}
      >
        Mode
      </button>
      
      {DEV_MODE && onOpenDebugModal && (
        <button
          style={{
            padding: "8px 12px",
            background: "#795548",
            color: "#fff",
            border: "1px solid #5d4037",
            cursor: "pointer",
            fontWeight: "bold"
          }}
          onClick={onOpenDebugModal}
          title="Open Debug Modal"
        >
          Debug
        </button>
      )}
      
      {mode === 'editing' && selectedEdges.length > 0 && (
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
      
      {mode === 'editing' && (selectedNodes.length === 1 || selectedEdges.length === 1) && (
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
      
      {mode === 'editing' && selectedNodes.length > 0 && (
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
      
      {canConnect && mode === 'editing' && (
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
      
      {mode === 'editing' && selectedNodes.length > 0 && (
        <NodeColorPicker
          selectedNodeIds={selectedNodes}
          onNodeColorChange={onNodeColorChange}
        />
      )}
    </div>
  );
}

export default GraphControls;
