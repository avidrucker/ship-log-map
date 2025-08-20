import React from "react";
import NodeColorPicker from "./NodeColorPicker";
import { DEV_MODE } from "./config/features";

function HamburgerIcon({ color = '#fff', size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="6" width="18" height="2" fill={color}></rect>
      <rect x="3" y="11" width="18" height="2" fill={color}></rect>
      <rect x="3" y="16" width="18" height="2" fill={color}></rect>
    </svg>
  );
}

function GraphControls({
  // editing-only actions
  mode,
  onExportMap,
  onResetMap,
  onCreateNode,
  onNewMap,
  onRotateCompass,
  onUndo,
  canUndo,
  onOpenDebugModal,
  onOpenShareModal,
  // selection state + conditional actions
  selectedNodes,
  selectedEdges,
  onDeleteSelectedNodes,
  onDeleteSelectedEdges,
  onEditSelected,
  onConnectNodes,
  onNodeColorChange,
  areNodesConnected,
  // collapse state
  collapsed,
  onToggleCollapsed
}) {
  if (mode !== 'editing') return null; // Only render in editing mode

  // When collapsed just show hamburger + label
  if (collapsed) {
    return (
      <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000 }}>
        <button
          onClick={onToggleCollapsed}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: 'rgba(0,0,0,0.55)', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontWeight: 'bold' }}
          aria-label="Open graph controls"
          title="Open graph controls"
        >
          <HamburgerIcon />
          <span>Controls</span>
        </button>
      </div>
    );
  }

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
      {/* Collapse button (open state) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onToggleCollapsed}
          style={{ padding: '4px 8px', background: 'rgba(0,0,0,0.55)', color: '#fff', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
          aria-label="Collapse graph controls"
          title="Collapse graph controls"
        >
          ✕
        </button>
      </div>
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
          onClick={onRotateCompass}
          title="Rotate compass only 90° clockwise"
        >
          Rotate Compass
        </button>
        <button
          style={{ padding: '8px 12px', background: '#2196f3', color: '#fff', border: '1px solid #1976d2', cursor: 'pointer' }}
          onClick={onOpenShareModal}
          title="Share map with others"
        >
          📤 Share
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
      {(canConnect || hasNodeSelection || hasEdgeSelection || canDelete || canEdit) && (
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
      )}
    </div>
  );
}

export default GraphControls;
