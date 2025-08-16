/**
 * **`appStateReducer.js`** 
 * - Complete state management solution
   - Unified state for selections, camera, and UI state
   - Action creators and reducer for consistent state updates
   - Eliminates multiple `useState` calls for related state
 */

// Action types
export const ACTION_TYPES = {
  // Selection actions
  SET_NODE_SELECTION: 'SET_NODE_SELECTION',
  SET_EDGE_SELECTION: 'SET_EDGE_SELECTION',
  CLEAR_ALL_SELECTIONS: 'CLEAR_ALL_SELECTIONS',
  
  // Renaming actions
  START_RENAME: 'START_RENAME',
  UPDATE_RENAME_VALUE: 'UPDATE_RENAME_VALUE',
  CANCEL_RENAME: 'CANCEL_RENAME',
  
  // Camera actions
  SET_ZOOM: 'SET_ZOOM',
  SET_CAMERA_POSITION: 'SET_CAMERA_POSITION',
  
  // Note editing actions
  START_NOTE_EDITING: 'START_NOTE_EDITING',
  CLOSE_NOTE_EDITING: 'CLOSE_NOTE_EDITING',
  
  // Note viewing actions (for playing mode)
  START_NOTE_VIEWING: 'START_NOTE_VIEWING',
  CLOSE_NOTE_VIEWING: 'CLOSE_NOTE_VIEWING',
  
  // Debug modal actions
  OPEN_DEBUG_MODAL: 'OPEN_DEBUG_MODAL',
  CLOSE_DEBUG_MODAL: 'CLOSE_DEBUG_MODAL',
  
  // Mode actions
  SET_MODE: 'SET_MODE',
  
  // UI state actions
  SET_SHOULD_FIT: 'SET_SHOULD_FIT',
  SET_LOAD_ERROR: 'SET_LOAD_ERROR',
  
  // Undo actions
  SET_UNDO_STATE: 'SET_UNDO_STATE',
  CLEAR_UNDO_STATE: 'CLEAR_UNDO_STATE',
  
  // Map name actions
  SET_MAP_NAME: 'SET_MAP_NAME',
  
  // CDN base URL actions
  SET_CDN_BASE_URL: 'SET_CDN_BASE_URL',
};

// Initial state
export const initialAppState = {
  selections: {
    nodes: {
      ids: [],
      order: []
    },
    edges: {
      ids: []
    },
    renaming: {
      nodeId: null,
      value: ""
    },
    noteEditing: {
      targetId: null,
      targetType: null // 'node' or 'edge'
    },
    noteViewing: {
      targetId: null
    },
    debugModal: {
      isOpen: false
    }
  },
  camera: {
    zoom: 1,
    position: { x: 0, y: 0 }
  },
  mode: 'editing', // 'editing' or 'playing'
  mapName: 'default_map', // Editable map name
  cdnBaseUrl: '', // CDN base URL for image loading
  ui: {
    shouldFitOnNextRender: false,
    loadError: null
  },
  undo: {
    lastGraphState: null
  }
};

// State reducer
export function appStateReducer(state, action) {
  switch (action.type) {
    case ACTION_TYPES.SET_NODE_SELECTION:
      return {
        ...state,
        selections: {
          ...state.selections,
          nodes: {
            ids: action.payload.nodeIds,
            order: action.payload.selectionOrder
          }
        }
      };
      
    case ACTION_TYPES.SET_EDGE_SELECTION:
      return {
        ...state,
        selections: {
          ...state.selections,
          edges: {
            ids: action.payload.edgeIds
          }
        }
      };
      
    case ACTION_TYPES.CLEAR_ALL_SELECTIONS:
      return {
        ...state,
        selections: {
          ...state.selections,
          nodes: { ids: [], order: [] },
          edges: { ids: [] }
        }
      };
      
    case ACTION_TYPES.START_RENAME:
      return {
        ...state,
        selections: {
          ...state.selections,
          renaming: {
            nodeId: action.payload.nodeId,
            value: action.payload.initialValue
          }
        }
      };
      
    case ACTION_TYPES.UPDATE_RENAME_VALUE:
      return {
        ...state,
        selections: {
          ...state.selections,
          renaming: {
            ...state.selections.renaming,
            value: action.payload.value
          }
        }
      };
      
    case ACTION_TYPES.CANCEL_RENAME:
      return {
        ...state,
        selections: {
          ...state.selections,
          renaming: {
            nodeId: null,
            value: ""
          }
        }
      };
      
    case ACTION_TYPES.START_NOTE_EDITING:
      return {
        ...state,
        selections: {
          ...state.selections,
          noteEditing: {
            targetId: action.payload.targetId,
            targetType: action.payload.targetType
          }
        }
      };
      
    case ACTION_TYPES.CLOSE_NOTE_EDITING:
      return {
        ...state,
        selections: {
          ...state.selections,
          noteEditing: {
            targetId: null,
            targetType: null
          }
        }
      };
      
    case ACTION_TYPES.START_NOTE_VIEWING:
      return {
        ...state,
        selections: {
          ...state.selections,
          noteViewing: {
            targetId: action.payload.targetId
          }
        }
      };
      
    case ACTION_TYPES.CLOSE_NOTE_VIEWING:
      return {
        ...state,
        selections: {
          ...state.selections,
          noteViewing: {
            targetId: null
          }
        }
      };
      
    case ACTION_TYPES.OPEN_DEBUG_MODAL:
      return {
        ...state,
        selections: {
          ...state.selections,
          debugModal: {
            isOpen: true
          }
        }
      };
      
    case ACTION_TYPES.CLOSE_DEBUG_MODAL:
      return {
        ...state,
        selections: {
          ...state.selections,
          debugModal: {
            isOpen: false
          }
        }
      };
      
    case ACTION_TYPES.SET_MODE:
      return {
        ...state,
        mode: action.payload.mode
      };
      
    case ACTION_TYPES.SET_MAP_NAME:
      return {
        ...state,
        mapName: action.payload.mapName
      };
      
    case ACTION_TYPES.SET_CDN_BASE_URL:
      return {
        ...state,
        cdnBaseUrl: action.payload.cdnBaseUrl
      };
      
    case ACTION_TYPES.SET_ZOOM:
      return {
        ...state,
        camera: {
          ...state.camera,
          zoom: action.payload.zoom
        }
      };
      
    case ACTION_TYPES.SET_CAMERA_POSITION:
      return {
        ...state,
        camera: {
          ...state.camera,
          position: action.payload.position
        }
      };
      
    case ACTION_TYPES.SET_SHOULD_FIT:
      return {
        ...state,
        ui: {
          ...state.ui,
          shouldFitOnNextRender: action.payload.shouldFit
        }
      };
      
    case ACTION_TYPES.SET_LOAD_ERROR:
      return {
        ...state,
        ui: {
          ...state.ui,
          loadError: action.payload.error
        }
      };
      
    case ACTION_TYPES.SET_UNDO_STATE:
      return {
        ...state,
        undo: {
          lastGraphState: action.payload.graphState
        }
      };
      
    case ACTION_TYPES.CLEAR_UNDO_STATE:
      return {
        ...state,
        undo: {
          lastGraphState: null
        }
      };
      
    default:
      return state;
  }
}

// Action creators
export const actions = {
  setNodeSelection: (nodeIds, selectionOrder) => ({
    type: ACTION_TYPES.SET_NODE_SELECTION,
    payload: { nodeIds, selectionOrder }
  }),
  
  setEdgeSelection: (edgeIds) => ({
    type: ACTION_TYPES.SET_EDGE_SELECTION,
    payload: { edgeIds }
  }),
  
  clearAllSelections: () => ({
    type: ACTION_TYPES.CLEAR_ALL_SELECTIONS
  }),
  
  startRename: (nodeId, initialValue) => ({
    type: ACTION_TYPES.START_RENAME,
    payload: { nodeId, initialValue }
  }),
  
  updateRenameValue: (value) => ({
    type: ACTION_TYPES.UPDATE_RENAME_VALUE,
    payload: { value }
  }),
  
  cancelRename: () => ({
    type: ACTION_TYPES.CANCEL_RENAME
  }),
  
  setZoom: (zoom) => ({
    type: ACTION_TYPES.SET_ZOOM,
    payload: { zoom }
  }),
  
  setCameraPosition: (position) => ({
    type: ACTION_TYPES.SET_CAMERA_POSITION,
    payload: { position }
  }),
  
  setShouldFit: (shouldFit) => ({
    type: ACTION_TYPES.SET_SHOULD_FIT,
    payload: { shouldFit }
  }),
  
  startNoteEditing: (targetId, targetType) => ({
    type: ACTION_TYPES.START_NOTE_EDITING,
    payload: { targetId, targetType }
  }),
  
  closeNoteEditing: () => ({
    type: ACTION_TYPES.CLOSE_NOTE_EDITING
  }),
  
  startNoteViewing: (targetId) => ({
    type: ACTION_TYPES.START_NOTE_VIEWING,
    payload: { targetId }
  }),
  
  closeNoteViewing: () => ({
    type: ACTION_TYPES.CLOSE_NOTE_VIEWING
  }),
  
  openDebugModal: () => ({
    type: ACTION_TYPES.OPEN_DEBUG_MODAL
  }),
  
  closeDebugModal: () => ({
    type: ACTION_TYPES.CLOSE_DEBUG_MODAL
  }),
  
  setMode: (mode) => ({
    type: ACTION_TYPES.SET_MODE,
    payload: { mode }
  }),
  
  setMapName: (mapName) => ({
    type: ACTION_TYPES.SET_MAP_NAME,
    payload: { mapName }
  }),
  
  setCdnBaseUrl: (cdnBaseUrl) => ({
    type: ACTION_TYPES.SET_CDN_BASE_URL,
    payload: { cdnBaseUrl }
  }),
  
  setLoadError: (error) => ({
    type: ACTION_TYPES.SET_LOAD_ERROR,
    payload: { error }
  }),
  
  setUndoState: (graphState) => ({
    type: ACTION_TYPES.SET_UNDO_STATE,
    payload: { graphState }
  }),
  
  clearUndoState: () => ({
    type: ACTION_TYPES.CLEAR_UNDO_STATE
  })
};
