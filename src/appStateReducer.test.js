// Regression guard for TASK-002 (delete/inline useModalState + useCollapseToggles).
// Tests the reducer actions those modules dispatch, so inlining them cannot silently
// break modal or collapse behaviour. Tests are intentionally at the reducer level —
// the interface is the pure (state, action) → state function, not the hook wrappers.

import { appStateReducer, ACTION_TYPES, initialAppState } from './appStateReducer';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function reduce(state, type, payload = {}) {
  return appStateReducer(state, { type, payload });
}

// ---------------------------------------------------------------------------
// debug modal
// ---------------------------------------------------------------------------

describe('debug modal', () => {
  test('OPEN_DEBUG_MODAL sets debugModal.isOpen to true', () => {
    const next = reduce(initialAppState, ACTION_TYPES.OPEN_DEBUG_MODAL);
    expect(next.selections.debugModal.isOpen).toBe(true);
  });

  test('CLOSE_DEBUG_MODAL sets debugModal.isOpen to false', () => {
    const opened = reduce(initialAppState, ACTION_TYPES.OPEN_DEBUG_MODAL);
    const next = reduce(opened, ACTION_TYPES.CLOSE_DEBUG_MODAL);
    expect(next.selections.debugModal.isOpen).toBe(false);
  });

  test('OPEN_DEBUG_MODAL does not mutate other selections', () => {
    const next = reduce(initialAppState, ACTION_TYPES.OPEN_DEBUG_MODAL);
    expect(next.selections.helpModal).toEqual(initialAppState.selections.helpModal);
    expect(next.selections.noteEditing).toEqual(initialAppState.selections.noteEditing);
  });
});

// ---------------------------------------------------------------------------
// help modal
// ---------------------------------------------------------------------------

describe('help modal', () => {
  test('OPEN_HELP_MODAL sets helpModal.isOpen to true', () => {
    const next = reduce(initialAppState, ACTION_TYPES.OPEN_HELP_MODAL);
    expect(next.selections.helpModal.isOpen).toBe(true);
  });

  test('CLOSE_HELP_MODAL sets helpModal.isOpen to false', () => {
    const opened = reduce(initialAppState, ACTION_TYPES.OPEN_HELP_MODAL);
    const next = reduce(opened, ACTION_TYPES.CLOSE_HELP_MODAL);
    expect(next.selections.helpModal.isOpen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// note editing modal
// ---------------------------------------------------------------------------

describe('note editing modal', () => {
  test('START_NOTE_EDITING sets targetId and targetType', () => {
    const next = reduce(initialAppState, ACTION_TYPES.START_NOTE_EDITING, {
      targetId: 'node-42',
      targetType: 'node',
    });
    expect(next.selections.noteEditing.targetId).toBe('node-42');
    expect(next.selections.noteEditing.targetType).toBe('node');
  });

  test('START_NOTE_EDITING works for edge targets', () => {
    const next = reduce(initialAppState, ACTION_TYPES.START_NOTE_EDITING, {
      targetId: 'edge-7',
      targetType: 'edge',
    });
    expect(next.selections.noteEditing.targetId).toBe('edge-7');
    expect(next.selections.noteEditing.targetType).toBe('edge');
  });

  test('CLOSE_NOTE_EDITING clears targetId and targetType', () => {
    const opened = reduce(initialAppState, ACTION_TYPES.START_NOTE_EDITING, {
      targetId: 'node-42',
      targetType: 'node',
    });
    const next = reduce(opened, ACTION_TYPES.CLOSE_NOTE_EDITING);
    expect(next.selections.noteEditing.targetId).toBeNull();
    expect(next.selections.noteEditing.targetType).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// note viewing (reading modal in playing mode)
// ---------------------------------------------------------------------------

describe('note viewing', () => {
  test('START_NOTE_VIEWING sets targetId', () => {
    const next = reduce(initialAppState, ACTION_TYPES.START_NOTE_VIEWING, {
      targetId: 'node-5',
    });
    expect(next.selections.noteViewing.targetId).toBe('node-5');
  });

  test('CLOSE_NOTE_VIEWING clears targetId', () => {
    const opened = reduce(initialAppState, ACTION_TYPES.START_NOTE_VIEWING, {
      targetId: 'node-5',
    });
    const next = reduce(opened, ACTION_TYPES.CLOSE_NOTE_VIEWING);
    expect(next.selections.noteViewing.targetId).toBeNull();
  });

  test('switching targets replaces targetId without an intermediate null', () => {
    const first = reduce(initialAppState, ACTION_TYPES.START_NOTE_VIEWING, { targetId: 'node-1' });
    const second = reduce(first, ACTION_TYPES.START_NOTE_VIEWING, { targetId: 'node-2' });
    expect(second.selections.noteViewing.targetId).toBe('node-2');
  });
});

// ---------------------------------------------------------------------------
// collapse toggles — guards for useCollapseToggles deletion (TASK-002)
// ---------------------------------------------------------------------------

describe('collapse toggles', () => {
  test('SET_UNIVERSAL_MENU_COLLAPSED to true', () => {
    const next = reduce(initialAppState, ACTION_TYPES.SET_UNIVERSAL_MENU_COLLAPSED, { collapsed: true });
    expect(next.ui.universalMenuCollapsed).toBe(true);
  });

  test('SET_UNIVERSAL_MENU_COLLAPSED to false', () => {
    const state = { ...initialAppState, ui: { ...initialAppState.ui, universalMenuCollapsed: true } };
    const next = reduce(state, ACTION_TYPES.SET_UNIVERSAL_MENU_COLLAPSED, { collapsed: false });
    expect(next.ui.universalMenuCollapsed).toBe(false);
  });

  test('SET_GRAPH_CONTROLS_COLLAPSED to true', () => {
    const next = reduce(initialAppState, ACTION_TYPES.SET_GRAPH_CONTROLS_COLLAPSED, { collapsed: true });
    expect(next.ui.graphControlsCollapsed).toBe(true);
  });

  test('SET_CAMERA_INFO_COLLAPSED to true', () => {
    const next = reduce(initialAppState, ACTION_TYPES.SET_CAMERA_INFO_COLLAPSED, { collapsed: true });
    expect(next.ui.cameraInfoCollapsed).toBe(true);
  });

  test('collapse toggles are independent — toggling one does not affect others', () => {
    const next = reduce(initialAppState, ACTION_TYPES.SET_UNIVERSAL_MENU_COLLAPSED, { collapsed: true });
    expect(next.ui.graphControlsCollapsed).toBe(false);
    expect(next.ui.cameraInfoCollapsed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAnyModalOpen selector logic — guards the computed value in useModalState
// ---------------------------------------------------------------------------

describe('isAnyModalOpen selector logic', () => {
  function isAnyModalOpen(state) {
    return (
      state.selections.debugModal.isOpen ||
      state.selections.helpModal.isOpen ||
      state.selections.noteEditing.targetId !== null ||
      state.selections.noteViewing.targetId !== null
    );
  }

  test('false when no modals are open', () => {
    expect(isAnyModalOpen(initialAppState)).toBe(false);
  });

  test('true when debug modal is open', () => {
    const state = reduce(initialAppState, ACTION_TYPES.OPEN_DEBUG_MODAL);
    expect(isAnyModalOpen(state)).toBe(true);
  });

  test('true when help modal is open', () => {
    const state = reduce(initialAppState, ACTION_TYPES.OPEN_HELP_MODAL);
    expect(isAnyModalOpen(state)).toBe(true);
  });

  test('true when note editing is active', () => {
    const state = reduce(initialAppState, ACTION_TYPES.START_NOTE_EDITING, {
      targetId: 'node-1',
      targetType: 'node',
    });
    expect(isAnyModalOpen(state)).toBe(true);
  });

  test('true when note viewing is active', () => {
    const state = reduce(initialAppState, ACTION_TYPES.START_NOTE_VIEWING, { targetId: 'node-1' });
    expect(isAnyModalOpen(state)).toBe(true);
  });

  test('false after closing all modals', () => {
    let state = reduce(initialAppState, ACTION_TYPES.OPEN_DEBUG_MODAL);
    state = reduce(state, ACTION_TYPES.CLOSE_DEBUG_MODAL);
    expect(isAnyModalOpen(state)).toBe(false);
  });
});
