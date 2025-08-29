# Architecture Overview

At a glance:

- **React App Shell (`src/App.*`)** orchestrates global state, data loading (JSON/URL params), and composes the UI: graph view + controls + modals.
- **Graph Adapter (e.g., `CytoscapeGraph.*`, `cyAdapter.*`)** bridges project data (nodes/edges, pictures, background/underlay) to Cytoscape’s elements and styles. Responsible for mounting/unmounting, cache usage, and event wiring.
- **Controls (e.g., `GraphControls.*`, `UniversalControls.*`)** expose user actions: zoom/pan, import/export JSON, toggles for background/underlay, CDN load, etc.
- **Validation (`rumorMapValidation.*`, schemas)** ensures data integrity for nodes, edges, pictures, and underlay settings before render.
- **Image/Cache Utilities (`ImageCache`, `ImageLoader`, etc.)** provide localStorage caching, CDN fallbacks, and grayscale transforms when necessary.
- **Modals (`NoteEditorModal`, `NoteViewerModal`, `DebugModal`)** handle editing and inspection flows.
- **Defaults/Config (`default_ship_log.json`, constants)** seed the app with example data and sensible defaults.

## Data Flow

```
JSON / URL Params / CDN
        │
        ▼
Validation & Normalization ──► App State ──► Graph Adapter (Cytoscape)
        │                                   │
        └────────── Modals/Controls ◄───────┘
```

- Loading from **CDN** or **JSON** yields normalized graph data.
- **App** composes the view and passes props into the **Graph Adapter**.
- **Controls** and **Modals** mutate app state and trigger reload/re-mount where necessary.
- Background/underlay images are cached and injected by the adapter if present.

## Testing

- Jest tests live under `__tests__/` or `*.test.*`. Suggested coverage:
  - Validation helpers
  - Adapter element shaping (nodes/edges labels and images)
  - Import/export (JSON & URL Query params)
