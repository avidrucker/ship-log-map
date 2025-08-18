// src/persistence/index.js
import { deserializeGraph, serializeGraph } from "../graph/ops.js";

const STORAGE_KEY = "ship_log_map_v1";
const MODE_STORAGE_KEY = "ship_log_map_mode_v1";
const UNDO_STORAGE_KEY = "ship_log_map_undo_v1";
const MAP_NAME_STORAGE_KEY = "ship_log_map_name_v1";
const SCHEMA_VERSION = 1;
const UNIVERSAL_MENU_COLLAPSED_KEY = "ship_log_universal_menu_collapsed_v1";
const GRAPH_CONTROLS_COLLAPSED_KEY = "ship_log_graph_controls_collapsed_v1";
const CAMERA_INFO_COLLAPSED_KEY = "ship_log_camera_info_collapsed_v1";

export function newBlankMap() {
  return { nodes: [], edges: [], notes: {}, mode: 'editing', __version: SCHEMA_VERSION };
}

export function saveToLocal(graph, key = STORAGE_KEY) {
  try {
    const g = deserializeGraph(graph);
    const payload = { ...g, __version: SCHEMA_VERSION };
    localStorage.setItem(key, serializeGraph(payload));
    return true;
  } catch (e) {
    console.error("saveToLocal failed:", e);
    return false;
  }
}

export function saveModeToLocal(mode) {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
    return true;
  } catch (e) {
    console.error("saveModeToLocal failed:", e);
    return false;
  }
}

export function loadModeFromLocal() {
  try {
    const mode = localStorage.getItem(MODE_STORAGE_KEY);
    return mode || 'editing'; // default to editing mode
  } catch (e) {
    console.error("loadModeFromLocal failed:", e);
    return 'editing';
  }
}

export function saveUndoStateToLocal(graphState) {
  try {
    if (graphState) {
      const payload = { ...graphState, __version: SCHEMA_VERSION };
      localStorage.setItem(UNDO_STORAGE_KEY, serializeGraph(payload));
    } else {
      localStorage.removeItem(UNDO_STORAGE_KEY);
    }
    return true;
  } catch (e) {
    console.error("saveUndoStateToLocal failed:", e);
    return false;
  }
}

export function loadUndoStateFromLocal() {
  try {
    const raw = localStorage.getItem(UNDO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Version gate if we ever need migrations
    if (typeof parsed.__version !== "number") parsed.__version = 1;
    return deserializeGraph(parsed);
  } catch (e) {
    console.error("loadUndoStateFromLocal failed:", e);
    return null;
  }
}

export function saveMapNameToLocal(mapName) {
  try {
    localStorage.setItem(MAP_NAME_STORAGE_KEY, mapName);
    return true;
  } catch (e) {
    console.error("saveMapNameToLocal failed:", e);
    return false;
  }
}

export function loadMapNameFromLocal() {
  try {
    const mapName = localStorage.getItem(MAP_NAME_STORAGE_KEY);
    return mapName || 'default_map'; // default map name
  } catch (e) {
    console.error("loadMapNameFromLocal failed:", e);
    return 'default_map';
  }
}

export function loadFromLocal(key = STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Version gate if we ever need migrations
    if (typeof parsed.__version !== "number") parsed.__version = 1;
    const graph = deserializeGraph(parsed);
    
    // Include mode if present in the saved data, otherwise default to editing
    if (parsed.mode) {
      graph.mode = parsed.mode;
    }
    
    // Include mapName if present in the saved data
    if (parsed.mapName) {
      graph.mapName = parsed.mapName;
    }
    
    // Include cdnBaseUrl if present in the saved data (even if empty string)
    if (typeof parsed.cdnBaseUrl === 'string') {
      graph.cdnBaseUrl = parsed.cdnBaseUrl;
    }
    
    return graph;
  } catch (e) {
    console.error("loadFromLocal failed:", e);
    return null;
  }
}

// For <input type="file"> (browser)
export function loadFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = (err) => reject(err);
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const graph = deserializeGraph(parsed);
        
        // Include mode if present in the imported data, otherwise default to editing
        if (parsed.mode) {
          graph.mode = parsed.mode;
        }
        
        // Include mapName if present in the imported data
        if (parsed.mapName) {
          graph.mapName = parsed.mapName;
        }
        
        // Include cdnBaseUrl if present in the imported data (even if empty string)
        if (typeof parsed.cdnBaseUrl === 'string') {
          graph.cdnBaseUrl = parsed.cdnBaseUrl;
        }
        
        resolve(graph);
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsText(file);
  });
}

export function saveUniversalMenuCollapsed(collapsed) {
  try { localStorage.setItem(UNIVERSAL_MENU_COLLAPSED_KEY, JSON.stringify(!!collapsed)); } catch { /* noop */ }
}
export function loadUniversalMenuCollapsed() {
  try { const v = localStorage.getItem(UNIVERSAL_MENU_COLLAPSED_KEY); return v ? JSON.parse(v) : false; } catch { return false; }
}
export function saveGraphControlsCollapsed(collapsed) {
  try { localStorage.setItem(GRAPH_CONTROLS_COLLAPSED_KEY, JSON.stringify(!!collapsed)); } catch { /* noop */ }
}
export function loadGraphControlsCollapsed() {
  try { const v = localStorage.getItem(GRAPH_CONTROLS_COLLAPSED_KEY); return v ? JSON.parse(v) : false; } catch { return false; }
}
export function saveCameraInfoCollapsed(collapsed) {
  try { localStorage.setItem(CAMERA_INFO_COLLAPSED_KEY, JSON.stringify(!!collapsed)); } catch { /* noop */ }
}
export function loadCameraInfoCollapsed() {
  try { const v = localStorage.getItem(CAMERA_INFO_COLLAPSED_KEY); return v ? JSON.parse(v) : false; } catch { return false; }
}
