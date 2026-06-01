import { useCallback } from 'react';
import { ACTION_TYPES } from '../appStateReducer';

export function useCollapseToggles({ dispatchAppState, universalMenuCollapsed, graphControlsCollapsed, cameraInfoCollapsed }) {
  const toggleUniversalMenu = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_UNIVERSAL_MENU_COLLAPSED, payload: { collapsed: !universalMenuCollapsed } });
  }, [dispatchAppState, universalMenuCollapsed]);

  const toggleGraphControls = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_GRAPH_CONTROLS_COLLAPSED, payload: { collapsed: !graphControlsCollapsed } });
  }, [dispatchAppState, graphControlsCollapsed]);

  const toggleCameraInfo = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_INFO_COLLAPSED, payload: { collapsed: !cameraInfoCollapsed } });
  }, [dispatchAppState, cameraInfoCollapsed]);

  return { toggleUniversalMenu, toggleGraphControls, toggleCameraInfo };
}
