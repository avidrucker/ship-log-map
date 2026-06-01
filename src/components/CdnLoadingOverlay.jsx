import React from 'react';

export default function CdnLoadingOverlay({ isLoading, error, onDismiss }) {
  return (
    <>
      {isLoading && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.8)',
          color: '#fff',
          padding: '20px',
          borderRadius: '8px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div
            className="spinner"
            style={{
              width: '20px',
              height: '20px',
              border: '2px solid #fff',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
            }}
          />
          Loading map from CDN...
        </div>
      )}

      {error && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#d32f2f',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '6px',
          zIndex: 9999,
          maxWidth: '500px',
          textAlign: 'center'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>CDN Loading Error</div>
          <div style={{ fontSize: '14px', marginBottom: '12px' }}>{error}</div>
          <button
            onClick={onDismiss}
            style={{
              background: '#fff',
              color: '#d32f2f',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
