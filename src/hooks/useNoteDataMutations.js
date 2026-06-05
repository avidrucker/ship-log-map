import { useCallback } from 'react';
import { renameNode } from '../graph/ops.js';
import { printDebug } from '../utils/debug.js';
import { ACTION_TYPES } from '../appStateReducer.js';

export function useNoteDataMutations({
  setGraphData,
  setGraphDataWithUndo,
  dispatchAppState,
  selectedNodeIds,
  nodeSelectionOrder,
  noteEditingTarget,
  noteViewingTarget,
  mapName,
  cdnBaseUrl,
}) {
  const handleUpdateNotes = useCallback((targetId, newNotes) => {
    setGraphData(prev => ({
      ...prev,
      notes: { ...(prev.notes || {}), [targetId]: newNotes }
    }));
  }, [setGraphData]);

  const handleUpdateTitle = useCallback((targetId, targetType, newTitle) => {
    if (targetType === "node") {
      setGraphDataWithUndo(prev => {
        // Use the renameNode function to handle ID updates and cascading changes
        const updatedGraph = renameNode(prev, targetId, newTitle);

        // Check if the node ID actually changed
        const oldNode = prev.nodes.find(n => n.id === targetId);
        const newNode = updatedGraph.nodes.find(n => n.title === newTitle);

        if (oldNode && newNode && oldNode.id !== newNode.id) {
          // Node ID changed, update selections if this node is selected
          if (selectedNodeIds.includes(targetId)) {
            const newSelectedIds = selectedNodeIds.map(id => id === targetId ? newNode.id : id);
            const newSelectionOrder = nodeSelectionOrder.map(id => id === targetId ? newNode.id : id);

            dispatchAppState({
              type: ACTION_TYPES.SET_NODE_SELECTION,
              payload: { nodeIds: newSelectedIds, selectionOrder: newSelectionOrder }
            });

            // Cytoscape selection sync is handled by CytoscapeGraph's selection-sync
            // useEffect which watches selectedNodeIds — no manual intervention needed here
          }

          // Update note editing target if it's the renamed node
          if (noteEditingTarget === targetId) {
            dispatchAppState({
              type: ACTION_TYPES.START_NOTE_EDITING,
              payload: { targetId: newNode.id, targetType: 'node' }
            });
          }

          // Update note viewing target if it's the renamed node
          if (noteViewingTarget === targetId) {
            dispatchAppState({
              type: ACTION_TYPES.START_NOTE_VIEWING,
              payload: { targetId: newNode.id }
            });
          }
        }

        return updatedGraph;
      });
    } else if (targetType === "edge") {
      // For edges, we could store title in a custom property or handle differently
      // For now, let's assume edges don't have editable titles, but we'll keep the interface
      console.warn("Edge title editing not yet implemented");
    }
  }, [selectedNodeIds, nodeSelectionOrder, noteEditingTarget, noteViewingTarget, setGraphDataWithUndo, dispatchAppState]);

  const handleUpdateImage = useCallback((nodeId, imagePath, immediateImageUrl = null) => {
    setGraphDataWithUndo(prev => ({
      ...prev,
      nodes: prev.nodes.map(n =>
        n.id === nodeId
          ? { ...n, imageUrl: imagePath }
          : n
      )
    }));

    // Force immediate visual update in Cytoscape
    // Dynamic import to avoid circular imports
    import('../graph/cyAdapter.js').then(({ forceNodeImageUpdate }) => {
      forceNodeImageUpdate(nodeId, imagePath, mapName, cdnBaseUrl, immediateImageUrl)
        .then(success => {
          if (success) {
            printDebug(`✅ [App] Successfully forced image update for node ${nodeId}`);
          } else {
            printDebug(`⚠️ [App] Failed to force image update for node ${nodeId}, will update on next sync`);
          }
        })
        .catch(error => {
          printDebug(`❌ [App] Error forcing image update for node ${nodeId}:`, error);
        });
    });
  }, [setGraphDataWithUndo, mapName, cdnBaseUrl]);

  return { handleUpdateNotes, handleUpdateTitle, handleUpdateImage };
}
