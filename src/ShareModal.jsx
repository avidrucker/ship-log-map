// src/ShareModal.jsx
import React, { useState, useCallback } from 'react';

function ShareModal({ 
  isOpen, 
  onClose, 
  mapName, 
  cdnBaseUrl 
}) {
  const [copyStatus, setCopyStatus] = useState('');

  // Construct the JSON filename from map name
  const jsonFileName = `${mapName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '')}.json`;
  
  // Construct the full CDN JSON URL
  const cdnJsonUrl = cdnBaseUrl ? `${cdnBaseUrl.replace(/\/$/, '')}/${jsonFileName}` : '';
  
  // Construct the shareable app URL
  const shareUrl = cdnJsonUrl ? `${window.location.origin}${window.location.pathname}?map=${encodeURIComponent(cdnJsonUrl)}` : '';

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus('✓ Copied to clipboard!');
      setTimeout(() => setCopyStatus(''), 2000);
    } catch {
      setCopyStatus('❌ Failed to copy');
      setTimeout(() => setCopyStatus(''), 2000);
    }
  }, [shareUrl]);

  const handleCopyJsonUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(cdnJsonUrl);
      setCopyStatus('✓ JSON URL copied!');
      setTimeout(() => setCopyStatus(''), 2000);
    } catch {
      setCopyStatus('❌ Failed to copy');
      setTimeout(() => setCopyStatus(''), 2000);
    }
  }, [cdnJsonUrl]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }}>
      <div style={{
        backgroundColor: '#1a1a1a',
        padding: '24px',
        borderRadius: '8px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
        position: 'relative',
        border: '1px solid #333'
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#ccc'
          }}
        >
          ×
        </button>

        <h2 style={{ marginTop: 0, marginBottom: '16px', color: '#fff' }}>
          📤 Share Map
        </h2>

        {!cdnBaseUrl ? (
          <div style={{ color: '#ff6b6b', marginBottom: '16px', padding: '12px', backgroundColor: '#2d1b1b', borderRadius: '4px', border: '1px solid #5c2e2e' }}>
            <strong>⚠️ No CDN Base URL Set</strong>
            <p style={{ margin: '8px 0 0 0', color: '#ffcdd2' }}>
              You need to set a CDN Base URL in the Camera Info panel before you can share maps.
            </p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#e0e0e0' }}>
                Step 1: Export and Upload Your Map
              </h3>
              <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.6', color: '#ccc' }}>
                <li>Click the "Save" button to export your map as JSON</li>
                <li>Rename the downloaded file to: <code style={{ background: '#333', padding: '2px 4px', borderRadius: '2px', color: '#fff' }}>{jsonFileName}</code></li>
                <li>Upload it to your CDN at: 
                  <div style={{ 
                    background: '#333', 
                    padding: '8px', 
                    margin: '4px 0', 
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    wordBreak: 'break-all',
                    position: 'relative',
                    color: '#fff',
                    border: '1px solid #555'
                  }}>
                    {cdnJsonUrl}
                    <button
                      onClick={handleCopyJsonUrl}
                      style={{
                        marginLeft: '8px',
                        padding: '4px 8px',
                        background: '#2196f3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      📋 Copy
                    </button>
                  </div>
                </li>
              </ol>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#e0e0e0' }}>
                Step 2: Share the Link
              </h3>
              <p style={{ margin: '0 0 8px 0', color: '#ccc' }}>
                Send this URL to share your map in read-only mode:
              </p>
              <div style={{ 
                background: '#333', 
                padding: '12px', 
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '14px',
                wordBreak: 'break-all',
                border: '1px solid #555',
                color: '#fff'
              }}>
                {shareUrl}
              </div>
              <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={handleCopyUrl}
                  style={{
                    padding: '8px 16px',
                    background: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  📋 Copy Share URL
                </button>
                {copyStatus && (
                  <span style={{ 
                    color: copyStatus.includes('✓') ? '#4caf50' : '#d32f2f',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}>
                    {copyStatus}
                  </span>
                )}
              </div>
            </div>

            <div style={{ 
              background: '#2a2a2a', 
              padding: '12px', 
              borderRadius: '4px',
              marginBottom: '16px',
              border: '1px solid #444'
            }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#64b5f6' }}>
                💡 How it works
              </h4>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#ccc' }}>
                <li>Recipients will see your map in read-only mode</li>
                <li>They can zoom, pan, rotate, and view notes</li>
                <li>They cannot edit nodes, edges, or map structure</li>
                <li>All images will load from your CDN automatically</li>
              </ul>
            </div>
          </>
        )}

        <div style={{ textAlign: 'right' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#555',
              color: 'white',
              border: '1px solid #666',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ShareModal;
