# Tasks

Open tasks for ship-log-map. Each task has enough context for an agent to pick it up cold.

---

## TASK-001 — Extract note-viewer state machine into `useNoteViewingState`

**Status:** done ✓  
**Priority:** high  
**Effort:** medium (~150 lines moved, ~5 refs hidden)

### Problem

`App.jsx` lines 700–857 contain a ~150-line state machine written with 5 mutable refs and inline `setTimeout` chains:

- `isClosingNoteViewRef`
- `isTransitioningRef`
- `isSwitchingTargetsRef`
- `suppressEmptyCloseRef`
- `viewingSessionRef`

These refs coordinate the note-viewing lifecycle: `open → zoom-to-target → typewriter-delay → viewing` and `close → maybe-restore-camera`. They are invisible to callers, undocumented, and untestable without mounting the full app with Cytoscape.

The two main functions involved:
- `handleStartNoteViewing()` — App.jsx ~line 700, ~100 lines
- `handleCloseNoteViewing()` — App.jsx ~line 810, ~50 lines

### Goal

Extract a `useNoteViewingState()` hook at `src/hooks/useNoteViewingState.js`.

**Target interface (small):**
```js
const { open, close, switchTarget, isOpen, activeNodeId } = useNoteViewingState({ cy, ... });
```

All 5 refs live inside the hook. App.jsx drops to ~3 lines of hook usage.

### Testability

Once extracted, each state transition is testable as a unit (TDD vertical slices, one test per transition):
- `open(nodeId)` → `isOpen === true`, `activeNodeId === nodeId`
- `close()` during a switch → camera restoration suppressed
- Stale session ID on slow zoom → viewer does not re-open
- `switchTarget(nodeId)` → previous target cleanly replaced

Use fake objects over mocks (yegor-unit-tests: prefer fakes). No Cytoscape mount needed for the state logic.

### Files to touch

- `src/App.jsx` — remove refs and inline handlers; call the new hook
- `src/hooks/useNoteViewingState.js` — create
- `src/hooks/index.js` — add export if the pattern is followed

---

## TASK-002 — Delete / inline shallow dispatcher modules

**Status:** done ✓  
**Priority:** high  
**Effort:** small (deletion + inlining, no new logic)

### Problem

Two modules are shallow pass-throughs that fail the deletion test — deleting them would cause complexity to vanish, not reappear:

**`src/hooks/useCollapseToggles.js` (18 lines)**  
Three one-liner callbacks that each dispatch a single reducer action. No logic, no invariants, no business rules. Callers could dispatch directly.

**`src/hooks/useModalState.js` (149 lines)**  
149 lines of `dispatch()` forwarding with mixed state ownership: some flags live in the reducer (`isDebugOpen`), one is a local `useState` (`isShareModalOpen`), one delegates to a different hook (`toggleBgImageModal`). No semantic deepening. The only piece worth keeping is the `isAnyModalOpen` computed selector.

### Goal

1. **Delete `useCollapseToggles.js`** — find all callers, inline the dispatch calls directly. Remove the file and its export from `src/hooks/index.js`.

2. **Trim `useModalState.js`** to only the `isAnyModalOpen` selector (or consolidate all modal flags into the reducer so the selector is trivial). Inline the open/close dispatch calls at their call sites in App.jsx.

### How to find callers

```bash
grep -rn "useCollapseToggles\|useModalState" src/
```

### Files to touch

- `src/hooks/useCollapseToggles.js` — delete
- `src/hooks/useModalState.js` — delete or trim to selector only
- `src/hooks/index.js` — remove exports
- `src/App.jsx` — inline the dispatch calls
- Any other callers found by the grep above

### Verification

Run `npm test` and `npm run lint` after. No behavior should change — this is pure structural cleanup.
