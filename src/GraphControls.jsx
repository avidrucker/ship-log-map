import React from "react";
import NodeColorPicker from "./NodeColorPicker";
import { DEV_MODE } from "./config/features";

function GraphControls({
  // editing-only actions
  mode,
  onExportMap,
  onResetMap,
  onCreateNode,
  onNewMap,
  onRotate,
  onUndo,
  canUndo,
  onOpenDebugModal,
  // selection state + conditional actions
  selectedNodes,
  selectedEdges,
  onDeleteSelectedNodes,
  onDeleteSelectedEdges,
  onEditSelected,
  onConnectNodes,
  onNodeColorChange,
  areNodesConnected
}) {
  if (mode !== 'editing') return null; // Only render in editing mode

  const canConnect = selectedNodes.length === 2 && !areNodesConnected(selectedNodes[0], selectedNodes[1]);
  const hasNodeSelection = selectedNodes.length > 0;
  const hasEdgeSelection = selectedEdges.length > 0;
  const canDelete = hasNodeSelection || hasEdgeSelection;
  const canEdit = (selectedNodes.length === 1) || (selectedEdges.length === 1);

  const handleDelete = () => {
    if (hasNodeSelection) {
      onDeleteSelectedNodes(selectedNodes);
    } else if (hasEdgeSelection) {
      onDeleteSelectedEdges(selectedEdges);
    }
  };

  return (
    <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Editing-only primary buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.55)', padding: '10px', borderRadius: '6px' }}>
        <button
          style={{ padding: '8px 12px', background: canUndo ? '#ff9800' : '#666', color: canUndo ? '#fff' : '#999', border: `1px solid ${canUndo ? '#f57c00' : '#555'}`, cursor: canUndo ? 'pointer' : 'not-allowed', opacity: canUndo ? 1 : 0.6 }}
          onClick={canUndo ? onUndo : undefined}
          disabled={!canUndo}
          title={canUndo ? 'Undo last action' : 'No action to undo'}
        >
          Undo
        </button>
        <button
          style={{ padding: '8px 12px', background: '#222', color: '#fff', border: '1px solid #444', cursor: 'pointer' }}
          onClick={onExportMap}
          title="Export Map JSON"
        >
          Save
        </button>
        <button
          style={{ padding: '8px 12px', background: '#d32f2f', color: '#fff', border: '1px solid #b71c1c', cursor: 'pointer' }}
          onClick={onResetMap}
          title="Reset Map to Initial State"
        >
          Reset
        </button>
        <button
          style={{ padding: '8px 12px', background: '#4caf50', color: '#fff', border: '1px solid #388e3c', cursor: 'pointer' }}
          onClick={onCreateNode}
          title="Add New Node"
        >
          Add
        </button>
        <button
          style={{ padding: '8px 12px', background: '#9e9e9e', color: '#fff', border: '1px solid #757575', cursor: 'pointer' }}
          onClick={onNewMap}
          title="Create New Empty Map"
        >
          New
        </button>
        <button
          style={{ padding: '8px 12px', background: '#455a64', color: '#fff', border: '1px solid #37474f', cursor: 'pointer' }}
          onClick={onRotate}
          title="Rotate all nodes 90° clockwise around origin"
        >
          Rotate
        </button>
        {DEV_MODE && onOpenDebugModal && (
          <button
            style={{ padding: '8px 12px', background: '#795548', color: '#fff', border: '1px solid #5d4037', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={onOpenDebugModal}
            title="Open Debug Modal"
          >
            Debug
          </button>
        )}
      </div>

      {/* Conditional selection buttons */}
      {
        (canConnect || hasNodeSelection || hasEdgeSelection || canDelete || canEdit) &&
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.55)', padding: '10px', borderRadius: '6px' }}>
        {canConnect && (
          <button
            style={{ padding: '8px 12px', background: '#4caf50', color: '#fff', border: '1px solid #388e3c', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={onConnectNodes}
          >
            Connect
          </button>
        )}
        {canEdit && (
          <button
            style={{ padding: '8px 12px', background: '#9c27b0', color: '#fff', border: '1px solid #6a1b9a', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={onEditSelected}
            title="Edit Label/Notes"
          >
            Edit
          </button>
        )}
        {canDelete && (
          <button
            style={{ padding: '8px 12px', background: '#e91e63', color: '#fff', border: '1px solid #ad1457', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={handleDelete}
            title={hasNodeSelection ? `Delete ${selectedNodes.length} Node${selectedNodes.length > 1 ? 's' : ''}` : `Delete ${selectedEdges.length} Edge${selectedEdges.length > 1 ? 's' : ''}`}
          >
            Del
          </button>
        )}
        {hasNodeSelection && (
          <NodeColorPicker selectedNodeIds={selectedNodes} onNodeColorChange={onNodeColorChange} />
        )}
      </div>
      }
    </div>
  );
}

export default GraphControls;
