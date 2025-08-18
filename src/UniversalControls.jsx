import React from 'react';

function UniversalControls({
  fileInputRef,
  onImportFile,
  onFitToView,
  onModeToggle,
  mode,
  showNoteCountOverlay,
  onToggleNoteCountOverlay
}) {
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
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={onImportFile}
        style={{ display: 'none' }}
      />
      <button
        style={{ padding: '6px 10px', background: mode === 'editing' ? '#ff9800' : '#2196f3', color: '#fff', border: `1px solid ${mode === 'editing' ? '#f57c00' : '#1976d2'}`, cursor: 'pointer', fontWeight: 'bold' }}
        onClick={onModeToggle}
        title={`Switch to ${mode === 'editing' ? 'Playing' : 'Editing'} Mode`}
      >
        Mode
      </button>
      <button
        style={{ padding: '6px 10px', background: '#1976d2', color: '#fff', border: '1px solid #0d47a1', cursor: 'pointer' }}
        onClick={() => fileInputRef.current?.click()}
        title="Load Map JSON"
      >
        Load
      </button>
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
    </div>
  );
}

export default UniversalControls;
