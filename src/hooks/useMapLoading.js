// src/hooks/useMapLoading.js

import { useEffect, useRef } from 'react';
import { normalizeGraphData, hydrateCoordsIfMissing, hasAnyQueryParams, getCanEditFromQuery } from '../utils/mapHelpers';
import { printDebug } from '../utils/debug';
import { loadMapFromCdn } from '../utils/cdnHelpers';
import { loadImageWithFallback } from '../utils/imageLoader';
import { dataUrlOrBlobToWebpDataUrl } from '../utils/imageUtils';

/**
 * Custom hook for map loading operations with URL monitoring
 * Delegates actual CDN loading to cdnHelpers.js
 * @param {Object} params - Hook parameters
 * @param {Object} params.appState - Current app state 
 * @param {Function} params.dispatchAppState - App state dispatch function
 * @param {Object} params.defaultShipLogData - Default ship log data
 * @param {Function} params.setGraphData - Function to set graph data
 * @param {Function} params.setBgImage - Function to set background image
 * @param {Function} params.setCdnLoadingState - Function to set CDN loading state
 * @param {Function} params.setIsLoadingFromCDN - Function to set loading state
 * @param {Function} params.clearCytoscapeSelections - Function to clear selections
 * @param {Function} params.clearUndoState - Function to clear undo state
 * @param {Function} params.saveModeToLocal - Function to save mode to localStorage
 * @param {Function} params.loadModeFromLocal - Function to load mode from localStorage
 * @param {Object} params.currentCdnLoadRef - Ref to track current CDN load
 * @param {string} params.cdnBaseUrl - Base CDN URL
 * @param {Object} params.ACTION_TYPES - Action types for reducer
 * @returns {Object} Map loading functions and effects
 */
export function useMapLoading({
  appState,
  dispatchAppState,
  defaultShipLogData,
  setGraphData,
  setBgImage,
  setCdnLoadingState,
  setIsLoadingFromCDN,
  clearCytoscapeSelections,
  clearUndoState,
  saveModeToLocal,
  loadModeFromLocal,
  currentCdnLoadRef,
  cdnBaseUrl,
  ACTION_TYPES
}) {

  // ⚠️ StrictMode in dev mounts effects twice; this latch prevents duplicate work before state catches up
  const hasRunUrlCheckRef = useRef(false);


  // URL monitoring effect - handles initial load and popstate navigation
  useEffect(() => {
    printDebug('🚨🚨🚨 [URL EFFECT] URL monitoring effect initialized - VERSION 4.0 (useMapLoading) 🚨🚨🚨');

    // Helper: get only the map URL from query params
    function getNormalizedMapUrlFromQuery() {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('map') || '';
    }

    // Handler for initial load and popstate navigation
    const handleURLChange = async () => {
      const normalizedMapUrl = getNormalizedMapUrlFromQuery();
      printDebug('[URL EFFECT] normalizedMapUrl:', JSON.stringify(normalizedMapUrl));
      printDebug('[URL EFFECT] lastLoadedMapUrl:', JSON.stringify(appState.lastLoadedMapUrl));
      printDebug('[URL EFFECT] Are they different?', normalizedMapUrl !== appState.lastLoadedMapUrl);

      // Only load if the normalized map URL has changed and is non-empty
      if (normalizedMapUrl && normalizedMapUrl !== appState.lastLoadedMapUrl) {
        // 🚫 Prevent duplicate in-flight loads of the *same* URL
        if (currentCdnLoadRef.current === normalizedMapUrl) {
          printDebug('[URL EFFECT] 🚫 Duplicate in-flight load detected, skipping:', normalizedMapUrl);
          return;
        }
        
        printDebug('[URL EFFECT] ✅ CONDITION MET - Map URL changed, loading from CDN:', normalizedMapUrl);

        // Set loading state
        setCdnLoadingState({ isLoading: true, error: null });
        setIsLoadingFromCDN(true);
        currentCdnLoadRef.current = normalizedMapUrl;

        try {
          const result = await loadMapFromCdn(normalizedMapUrl);

          // Only proceed if this is still the current load operation
          if (currentCdnLoadRef.current !== normalizedMapUrl) {
            printDebug('[URL EFFECT] ⏭️ CDN load operation superseded, skipping state update');
            return;
          }

          if (result.success) {
            const normalizedData = normalizeGraphData(result.data);
            const hydratedData = hydrateCoordsIfMissing(normalizedData, defaultShipLogData);

            // --- MODE OVERRIDE LOGIC ---
            // This is the bit that ensures refresh doesn't yank the mode back to the JSON value when canedit=true or there are no params.
            const canEditFromQuery = getCanEditFromQuery();
            const hasQueryParams = hasAnyQueryParams();
            let forcedMode;
            if (canEditFromQuery) {
              // canedit=true: preserve current/saved on refresh; fallback to JSON
              const savedMode = (typeof loadModeFromLocal === 'function') ? loadModeFromLocal() : null;
              forcedMode = savedMode || hydratedData.mode || 'editing';
            } else if (hasQueryParams) {
              // Query params present but *no* canedit=true → read-only
              forcedMode = 'playing';
            } else {
              // No query params → editable link; preserve saved, else honor JSON
              const savedMode = (typeof loadModeFromLocal === 'function') ? loadModeFromLocal() : null;
              forcedMode = savedMode || hydratedData.mode || 'editing';
            }
            const hydratedDataWithMode = { ...hydratedData, mode: forcedMode };
            setGraphData(hydratedDataWithMode);
            dispatchAppState({ type: ACTION_TYPES.SET_MODE, payload: { mode: forcedMode } });
            saveModeToLocal(forcedMode);

            // Update app state with loaded data
            if (typeof hydratedData.mapName === 'string') {
              dispatchAppState({ type: ACTION_TYPES.SET_MAP_NAME, payload: { mapName: hydratedData.mapName } });
            }
            if (typeof hydratedData.cdnBaseUrl === 'string') {
              dispatchAppState({ type: ACTION_TYPES.SET_CDN_BASE_URL, payload: { cdnBaseUrl: hydratedData.cdnBaseUrl } });
            }
            if (typeof hydratedData.orientation === 'number') {
              dispatchAppState({ type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: hydratedData.orientation } });
            }
            if (typeof hydratedData.compassVisible === 'boolean') {
              dispatchAppState({ type: ACTION_TYPES.SET_COMPASS_VISIBLE, payload: { visible: hydratedData.compassVisible } });
            }
            
            // Handle background image loading
            if (typeof hydratedData.bgImage === 'object' && hydratedData.bgImage !== null) {
              let bgImageToSet = { ...hydratedData.bgImage };
              bgImageToSet.included = !!bgImageToSet.imageUrl;
              printDebug(`useMapLoading: Attempting to load background image ${bgImageToSet.imageUrl ? 'from URL' : 'as empty'} for map ${hydratedData.mapName}`);
              
              if (bgImageToSet.included) {
                try {
                  printDebug("!!! URL CHANGE: Attempting to load BG image:", bgImageToSet.imageUrl);
                  
                  // ⬇️ fullSize=true (do not cache, no thumb)
                  const rawDataUrl = await loadImageWithFallback(
                    bgImageToSet.imageUrl,
                    hydratedData.mapName,
                    hydratedData.cdnBaseUrl || cdnBaseUrl,
                    { fullSize: true }
                  );

                  // ⬇️ convert heavy PNG/JPEG to WebP, clamp size to 2048px
                  const webpDataUrl = await dataUrlOrBlobToWebpDataUrl(rawDataUrl, 2048, 0.82);

                  bgImageToSet = { ...bgImageToSet, imageUrl: webpDataUrl, included: true };
                  printDebug("URL CHANGE: Loaded BG image dataUrl:", webpDataUrl);
                } catch {
                  printDebug("URL CHANGE: Failed to load BG image, setting to empty");
                  bgImageToSet = { ...bgImageToSet, imageUrl: "", included: false };
                }
              } else {
                printDebug('useMapLoading: No background image URL provided, skipping load.');
              }
              setBgImage(bgImageToSet);
              dispatchAppState({ type: ACTION_TYPES.SET_BG_IMAGE, payload: { bgImage: bgImageToSet } });
            } else {
              printDebug('useMapLoading: No background image URL provided, skipping load.');
            }
            
            // Reset camera + fit
            console.log("useMapLoading: Internally resetting camera due to URL change");
            // dispatchAppState({ type: ACTION_TYPES.SET_ZOOM_INTERNAL, payload: { zoom: 1 } });
            // dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION_INTERNAL, payload: { position: { x: 0, y: 0 } } });
            setTimeout(() => {
              dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } });
            }, 10);  
                      
            // Clear selections and undo state (loading clears undo)
            clearCytoscapeSelections();
            dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
            clearUndoState();

            // Track the loaded map URL
            dispatchAppState({ type: ACTION_TYPES.SET_LAST_LOADED_MAP_URL, payload: { url: normalizedMapUrl } });

            setCdnLoadingState({ isLoading: false, error: null });
            setIsLoadingFromCDN(false);
            currentCdnLoadRef.current = null;
          } else {
            setCdnLoadingState({ isLoading: false, error: result.error });
            setIsLoadingFromCDN(false);
            currentCdnLoadRef.current = null;
          }
        } catch (error) {
          setCdnLoadingState({ isLoading: false, error: 'Unexpected error: ' + error.message });
          setIsLoadingFromCDN(false);
          currentCdnLoadRef.current = null;
        }
      } else {
        printDebug('[URL EFFECT] ❌ CONDITION NOT MET - Map URL unchanged, skipping CDN load');
      }
    };

    // Initial check on mount
    printDebug('[URL EFFECT] Running initial URL check');
    if (hasRunUrlCheckRef.current) {
      printDebug('[URL EFFECT] Skipping duplicate initial check (StrictMode)');
    } else {
      hasRunUrlCheckRef.current = true;
      handleURLChange();
    }

    // Listen for popstate events (back/forward navigation)
    window.addEventListener('popstate', handleURLChange);
    printDebug('[URL EFFECT] Added popstate listener');

    // Clean up listener
    return () => {
      window.removeEventListener('popstate', handleURLChange);
    };
  }, [
    appState.lastLoadedMapUrl, 
    clearCytoscapeSelections, 
    clearUndoState, 
    cdnBaseUrl, 
    setBgImage,
    defaultShipLogData,
    setGraphData,
    setCdnLoadingState,
    setIsLoadingFromCDN,
    currentCdnLoadRef,
    dispatchAppState,
    saveModeToLocal,
    loadModeFromLocal,
    ACTION_TYPES
  ]);

  // Return empty object for now - we can add manual loading functions later if needed
  return {};
}
