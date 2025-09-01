// src/components/CameraInfo.jsx

/**
 * CameraInfo — Live readout of graph camera/viewport
 *
 * Responsibilities
 * - Displays pan/zoom info (useful while debugging fit/resize behavior).
 * - Displays map name, enables editing of map name
 * - Displays map CDN, enables editing of map CDN
 * - Displays current mode (editing/playing)
 * - Displays node/edge selections
 * - Displays FPS counter when in DEV_MODE
 *
 * Props
 * - getCameraInfo(): { zoom, panX, panY } supplied by useCytoscapeInstance.
 * - mapName: current name of the map
 * - onMapNameChange: callback to update the map name
 * - cdnBaseUrl: current CDN base URL
 * - onCdnBaseUrlChange: callback to update the CDN base URL
 * - selectedNodeIds, selectedEdgeIds: arrays of currently selected node/edge IDs
 */

import React, { useState, useCallback, useEffect } from "react";
import { DEV_MODE } from "../config/features";
import FpsCounter from "./FpsCounter";
import { HamburgerIcon } from "./HamburgerIcon";

function CameraInfo({ zoom, pan, selectedNodeIds, selectedEdgeIds, mode, mapName, onMapNameChange, cdnBaseUrl, onCdnBaseUrlChange, collapsed, onToggleCollapsed }) {
  const [isEditingMapName, setIsEditingMapName] = useState(false);
  const [tempMapName, setTempMapName] = useState(mapName);
  const [isEditingCdnUrl, setIsEditingCdnUrl] = useState(false);
  const [tempCdnUrl, setTempCdnUrl] = useState(cdnBaseUrl);

  // Map name editing handlers
  const handleStartEditMapName = useCallback(() => {
    setTempMapName(mapName);
    setIsEditingMapName(true);
  }, [mapName]);

  const handleSaveMapName = useCallback(() => {
    const cleanName = tempMapName.trim();
    if (cleanName && cleanName !== mapName) {
      onMapNameChange(cleanName);
    }
    setIsEditingMapName(false);
  }, [tempMapName, mapName, onMapNameChange]);

  const handleCancelEditMapName = useCallback(() => {
    setTempMapName(mapName);
    setIsEditingMapName(false);
  }, [mapName]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSaveMapName();
    } else if (e.key === 'Escape') {
      handleCancelEditMapName();
    }
  }, [handleSaveMapName, handleCancelEditMapName]);

  // CDN URL editing handlers
  const handleStartEditCdnUrl = useCallback(() => {
    setTempCdnUrl(cdnBaseUrl);
    setIsEditingCdnUrl(true);
  }, [cdnBaseUrl]);

  const handleSaveCdnUrl = useCallback(() => {
    const cleanUrl = tempCdnUrl.trim();
    if (cleanUrl !== cdnBaseUrl) {
      onCdnBaseUrlChange(cleanUrl);
    }
    setIsEditingCdnUrl(false);
  }, [tempCdnUrl, cdnBaseUrl, onCdnBaseUrlChange]);

  const handleCancelEditCdnUrl = useCallback(() => {
    setTempCdnUrl(cdnBaseUrl);
    setIsEditingCdnUrl(false);
  }, [cdnBaseUrl]);

  const handleCdnKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSaveCdnUrl();
    } else if (e.key === 'Escape') {
      handleCancelEditCdnUrl();
    }
  }, [handleSaveCdnUrl, handleCancelEditCdnUrl]);

  // Sync temp values if props change while not editing
  useEffect(() => { if (!isEditingMapName) setTempMapName(mapName); }, [mapName, isEditingMapName]);
  useEffect(() => { if (!isEditingCdnUrl) setTempCdnUrl(cdnBaseUrl); }, [cdnBaseUrl, isEditingCdnUrl]);

  // Collapsed view JSX
  const collapsedView = (
    <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1000 }}>
      <button
        onClick={onToggleCollapsed}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: 'rgba(0,0,0,0.55)', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontWeight: 'bold' }}
        aria-label="Open camera info"
        title="Open camera info"
      >
        <HamburgerIcon />
        <span>Camera</span>
      </button>
    </div>
  );

  if (collapsed) return collapsedView;

  return (
    <div style={{
      position: "absolute",
      top: "10px",
      left: "10px",
      zIndex: 1000,
      background: "rgba(0, 0, 0, 0.7)",
      color: "#fff",
      padding: "10px",
      borderRadius: "5px",
      fontFamily: "monospace",
      fontSize: "12px",
      minWidth: '180px'
    }}>
      {/* Collapse button */}
      <div style={{ position: 'absolute', top: '4px', right: '4px' }}>
        <button
          onClick={onToggleCollapsed}
          style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
          aria-label="Collapse camera info"
          title="Collapse camera info"
        >
          ✕
        </button>
      </div>
      <div style={{ 
        color: mode === 'editing' ? "#4caf50" : "#2196f3",
        fontWeight: "bold",
        marginBottom: "8px",
        textTransform: "uppercase",
        fontSize: "14px"
      }}>
        {mode === 'editing' ? 'Editing' : 'Playing'}
      </div>
      {/* Map Name Field */}
      <div style={{ marginBottom: "8px" }}>
        <div style={{ color: "#888", fontSize: "10px", marginBottom: "2px" }}>Map Name:</div>
        {isEditingMapName ? (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <input
              type="text"
              value={tempMapName}
              onChange={(e) => setTempMapName(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                background: "#333",
                color: "#fff",
                border: "1px solid #4caf50",
                padding: "2px 4px",
                borderRadius: "2px",
                fontSize: "11px",
                fontFamily: "monospace",
                width: "100px"
              }}
              autoFocus
            />
            <button
              onClick={handleSaveMapName}
              style={{
                background: "#4caf50",
                color: "#fff",
                border: "none",
                borderRadius: "2px",
                padding: "2px 4px",
                cursor: "pointer",
                fontSize: "10px"
              }}
            >
              ✓
            </button>
            <button
              onClick={handleCancelEditMapName}
              style={{
                background: "#666",
                color: "#fff",
                border: "none",
                borderRadius: "2px",
                padding: "2px 4px",
                cursor: "pointer",
                fontSize: "10px"
              }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div 
            onClick={handleStartEditMapName}
            style={{
              cursor: "pointer",
              textDecoration: "underline dotted",
              color: "#4fc3f7",
              fontSize: "11px"
            }}
            title="Click to edit map name"
          >
            {mapName}
          </div>
        )}
      </div>
      {/* CDN Base URL Field */}
      <div style={{ marginBottom: "8px" }}>
        <div style={{ color: "#888", fontSize: "10px", marginBottom: "2px" }}>Image CDN URL:</div>
        {isEditingCdnUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <input
              type="text"
              value={tempCdnUrl}
              onChange={(e) => setTempCdnUrl(e.target.value)}
              onKeyDown={handleCdnKeyDown}
              placeholder="https://example.com/images"
              style={{
                background: "#333",
                color: "#fff",
                border: "1px solid #ff9800",
                padding: "2px 4px",
                borderRadius: "2px",
                fontSize: "11px",
                fontFamily: "monospace",
                width: "140px"
              }}
              autoFocus
            />
            <button
              onClick={handleSaveCdnUrl}
              style={{
                background: "#ff9800",
                color: "#fff",
                border: "none",
                borderRadius: "2px",
                padding: "2px 4px",
                cursor: "pointer",
                fontSize: "10px"
              }}
            >
              ✓
            </button>
            <button
              onClick={handleCancelEditCdnUrl}
              style={{
                background: "#666",
                color: "#fff",
                border: "none",
                borderRadius: "2px",
                padding: "2px 4px",
                cursor: "pointer",
                fontSize: "10px"
              }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div 
            onClick={handleStartEditCdnUrl}
            style={{
              cursor: "pointer",
              textDecoration: "underline dotted",
              color: "#ff9800",
              fontSize: "11px",
              wordBreak: "break-all",
              maxWidth: "200px",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis"
            }}
            title="Click to edit CDN base URL"
          >
            {cdnBaseUrl || 'No CDN URL set'}
          </div>
        )}
      </div>
      <div>Zoom: {(zoom * 100).toFixed(0)}%</div>
      <div>Camera:<br/>({Math.round(pan.x)},{Math.round(pan.y)})</div>
      {selectedNodeIds.length > 0 && (
        <div style={{ color: "#4fc3f7" }}>
          Nodes: {selectedNodeIds.length} selected
        </div>
      )}
      {selectedEdgeIds.length > 0 && (
        <div style={{ color: "#ff6b6b" }}>
          Edges: {selectedEdgeIds.length} selected
        </div>
      )}
      {/* FPS Counter: Only show in DEV_MODE */}
      {DEV_MODE && (
        <div style={{ marginTop: "10px" }}>
          <FpsCounter />
        </div>
      )}
    </div>
  );
}

export default CameraInfo;
