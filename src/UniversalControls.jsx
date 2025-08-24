import React from 'react';

function HamburgerIcon({ color = '#fff', size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="6" width="18" height="2" fill={color}></rect>
      <rect x="3" y="11" width="18" height="2" fill={color}></rect>
      <rect x="3" y="16" width="18" height="2" fill={color}></rect>
    </svg>
  );
}

function UniversalControls({
  fileInputRef,
  onImportFile,
  onFitToView,
  onModeToggle,
  mode,
  showNoteCountOverlay,
  onToggleNoteCountOverlay,
  onRotateNodesAndCompass,
  orientation,
  compassVisible,
  onToggleCompass,
  collapsed,
  onToggleCollapsed,
  cdnBaseUrl,
  onLoadFromCdn
}) {
  if (collapsed) {
    return (
      <div style={{ position: 'absolute', left: '10px', bottom: '10px', zIndex: 1000 }}>
        <button
          onClick={onToggleCollapsed}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: 'rgba(0,0,0,0.55)', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontWeight: 'bold' }}
          aria-label="Open universal menu"
          title="Open universal menu"
        >
          <HamburgerIcon />
          <span>Menu</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ 
        position: 'absolute', 
        left: '10px', 
        bottom: '10px', 
        zIndex: 1000, 
        display: 'flex', 
        flexDirection: 'column',
        gap: '8px', 
        background: 'rgba(0,0,0,0.55)', 
        padding: '8px 10px', 
        borderRadius: '6px' }}>
      {/* Collapse button (open state) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onToggleCollapsed}
          style={{ padding: '4px 8px', background: 'rgba(0,0,0,0.55)', color: '#fff', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
          aria-label="Collapse universal menu"
          title="Collapse universal menu"
        >
          ✕
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={onImportFile}
        style={{ display: 'none' }}
      />
      {onModeToggle && (
        <button
          style={{ padding: '6px 10px', background: mode === 'editing' ? '#ff9800' : '#2196f3', color: '#fff', border: `1px solid ${mode === 'editing' ? '#f57c00' : '#1976d2'}`, cursor: 'pointer', fontWeight: 'bold' }}
          onClick={onModeToggle}
          title={`Switch to ${mode === 'editing' ? 'Playing' : 'Editing'} Mode`}
        >
          Mode
        </button>
      )}
      <button
        style={{ padding: '6px 10px', background: '#1976d2', color: '#fff', border: '1px solid #0d47a1', cursor: 'pointer' }}
        onClick={() => fileInputRef.current?.click()}
        title="Load Map JSON"
      >
        Load JSON
      </button>
      {/* Load CDN button, only if cdnBaseUrl is set and not empty */}
      {cdnBaseUrl && cdnBaseUrl.trim() !== '' && (
        <button
          style={{ padding: '6px 10px', background: '#009688', color: '#fff', border: '1px solid #00695c', cursor: 'pointer', fontWeight: 'bold' }}
          onClick={() => onLoadFromCdn(cdnBaseUrl)}
          title="Reload map and state from CDN"
        >
          Load CDN
        </button>
      )}
      <button
        style={{ padding: '6px 10px', background: '#222', color: '#fff', border: '1px solid #444', cursor: 'pointer' }}
        onClick={onFitToView}
        title="Fit Map to Viewport"
      >
        Fit
      </button>
      <button
        style={{ padding: '6px 10px', background: showNoteCountOverlay ? '#4caf50' : '#666', color: '#fff', border: `1px solid ${showNoteCountOverlay ? '#388e3c' : '#555'}`, cursor: 'pointer' }}
        onClick={onToggleNoteCountOverlay}
        title={`${showNoteCountOverlay ? 'Hide' : 'Show'} Note Count Overlay`}
      >
        Notes {showNoteCountOverlay ? 'ON' : 'OFF'}
      </button>
      <button
        style={{ padding: '6px 10px', background: '#455a64', color: '#fff', border: '1px solid #37474f', cursor: 'pointer' }}
        onClick={onRotateNodesAndCompass}
        title={`Rotate entire map 90° clockwise (orientation: ${orientation}°)`}
      >
        Map ↻
      </button>
      <button
        style={{ padding: '6px 10px', background: compassVisible ? '#8d6e63' : '#666', color: '#fff', border: `1px solid ${compassVisible ? '#6d4c41' : '#555'}`, cursor: 'pointer' }}
        onClick={onToggleCompass}
        title={`${compassVisible ? 'Hide' : 'Show'} Compass`}
      >
        Comp {compassVisible ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

export default UniversalControls;
