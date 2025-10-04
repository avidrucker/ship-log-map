// src/components/HelpModal.jsx
import React, { useEffect } from 'react';
import packageJson from '../../package.json';
import { getCanEditFromQuery, hasAnyQueryParams } from '../utils/mapHelpers.js';

function HelpModal({ isOpen, onClose }) {
  const canEdit = getCanEditFromQuery() || !hasAnyQueryParams();
  const currentUrl = window.location.href;
  const baseUrl = window.location.origin + window.location.pathname;
  
  // Generate URLs for different modes
  const readOnlyUrl = hasAnyQueryParams() 
    ? currentUrl.replace(/[&?]canedit=true/gi, '')
    : `${baseUrl}?map=example_map.json`;
  
  const editableUrl = hasAnyQueryParams()
    ? currentUrl.includes('canedit=true') 
      ? currentUrl 
      : currentUrl + '&canedit=true'
    : baseUrl;

  // Close modal on Escape key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: '#1e1e1e',
          color: '#ffffff',
          padding: '30px',
          borderRadius: '12px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          border: '2px solid #444',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: '#4fc3f7', fontSize: '24px' }}>
            Ship Log Map - Help
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Close Help"
          >
            ✕
          </button>
        </div>

        {/* Version Info */}
        <div style={{ marginBottom: '25px', padding: '15px', backgroundColor: 'rgba(79, 195, 247, 0.1)', borderRadius: '8px', border: '1px solid rgba(79, 195, 247, 0.3)' }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#4fc3f7' }}>Version Information</h3>
          <p style={{ margin: '0', fontSize: '14px' }}>
            <strong>App Version:</strong> v{packageJson.version}<br/>
            <strong>Mode:</strong> {canEdit ? 'Full Editing Mode' : 'Read-Only Mode'}
          </p>
        </div>

        {/* Current Mode Instructions */}
        {!canEdit ? (
          <div style={{ marginBottom: '25px' }}>
            <h3 style={{ color: '#ff9800', marginBottom: '15px' }}>📖 Read-Only Mode</h3>
            <p style={{ marginBottom: '15px', lineHeight: '1.5' }}>
              You're currently in <strong>read-only mode</strong>. Here's what each button in the Universal Menu does:
            </p>
            
            <div style={{ marginLeft: '15px', marginBottom: '15px' }}>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#4fc3f7' }}>Search:</strong> Search for nodes and hashtags in the map
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#4fc3f7' }}>Clear:</strong> Clear your reading/visit history for this map
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#4fc3f7' }}>Load JSON:</strong> Load a different map from a JSON file
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#4fc3f7' }}>Load CDN:</strong> Reload the current map from its online source
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#4fc3f7' }}>Fit:</strong> Zoom out to see the entire map
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#4fc3f7' }}>Notes ON/OFF:</strong> Show/hide note count numbers on nodes and edges
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#4fc3f7' }}>Map ↻:</strong> Rotate the entire map 90° clockwise
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#4fc3f7' }}>Comp ON/OFF:</strong> Show/hide the compass rose
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#4fc3f7' }}>Show Img ON/OFF:</strong> Toggle background image visibility (if available)
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '25px' }}>
            <h3 style={{ color: '#4caf50', marginBottom: '15px' }}>✏️ Full Editing Mode</h3>
            <p style={{ lineHeight: '1.5' }}>
              You have full access to create, edit, and manage maps. You can switch between 
              <strong> Editing Mode</strong> and <strong> Playing Mode</strong> using the Mode button, 
              create new nodes, add connections, edit notes, and save your changes.
            </p>
          </div>
        )}

        {/* Activation Instructions */}
        <div style={{ marginBottom: '25px' }}>
          <h3 style={{ color: '#4caf50', marginBottom: '15px' }}>🔓 Unlock Full Editing Mode</h3>
          
          <p style={{ marginBottom: '15px', lineHeight: '1.5' }}>
            To activate full editing capabilities, you can:
          </p>
          
          <div style={{ marginLeft: '15px', marginBottom: '15px' }}>
            <div style={{ marginBottom: '12px' }}>
              <strong>Option 1:</strong> Remove all query parameters from the URL<br/>
              <code style={{ 
                backgroundColor: 'rgba(0,0,0,0.3)', 
                padding: '4px 8px', 
                borderRadius: '4px', 
                fontSize: '12px',
                display: 'block',
                marginTop: '5px',
                wordBreak: 'break-all'
              }}>
                {baseUrl}
              </code>
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <strong>Option 2:</strong> Add <code style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '3px' }}>&canedit=true</code> to the current URL<br/>
              <code style={{ 
                backgroundColor: 'rgba(0,0,0,0.3)', 
                padding: '4px 8px', 
                borderRadius: '4px', 
                fontSize: '12px',
                display: 'block',
                marginTop: '5px',
                wordBreak: 'break-all'
              }}>
                {editableUrl}
              </code>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {!canEdit && (
              <button
                onClick={() => window.location.href = editableUrl}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                Enable Editing Mode
              </button>
            )}
            
            {canEdit && hasAnyQueryParams() && (
              <button
                onClick={() => window.location.href = baseUrl}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Go to Clean URL
              </button>
            )}
          </div>
        </div>

        {/* General Usage */}
        <div style={{ marginBottom: '25px' }}>
          <h3 style={{ color: '#9c27b0', marginBottom: '15px' }}>🎮 General Usage</h3>
          <div style={{ marginLeft: '15px' }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>Click nodes:</strong> View notes and information
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Search (Ctrl/⌘ + F):</strong> Find nodes by name or hashtags
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>F key:</strong> Fit map to screen
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Escape key:</strong> Close modals and clear selections
            </div>
            {canEdit && (
              <>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Double-click nodes:</strong> Cycle through sizes (editing mode)
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Double-click edges:</strong> Cycle through directions (editing mode)
                </div>
              </>
            )}
          </div>
        </div>

        {/* Close Button */}
        <div style={{ textAlign: 'center', marginTop: '30px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 30px',
              backgroundColor: '#666',
              color: 'white',
              border: '1px solid #888',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            Close Help
          </button>
        </div>
      </div>
    </div>
  );
}

export default HelpModal;