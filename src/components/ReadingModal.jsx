// src/components/ReadingModal.jsx
import React, { useEffect } from 'react';
import { getDefaultPlaceholderSvg } from '../utils/imageLoader.js';
import { TEST_ICON_SVG } from '../constants/testAssets.js';

function ReadingModal({ isOpen, onClose, nodes = [], notes = {}, cdnBaseUrl = '', mapName = '', getCy = null }) {
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

  // Filter nodes that have notes
  const nodesWithNotes = nodes.filter(node => {
    const nodeNotes = notes[node.id];
    if (Array.isArray(nodeNotes)) {
      return nodeNotes.some(note => note && note.trim().length > 0);
    }
    return nodeNotes && nodeNotes.trim().length > 0;
  }).sort((a, b) => {
    // Sort alphabetically by title (case-insensitive)
    const titleA = (a.title || a.id).toLowerCase();
    const titleB = (b.title || b.id).toLowerCase();
    return titleA.localeCompare(titleB);
  });

  // Helper to get note text
  const getNodeNoteText = (nodeId) => {
    const nodeNotes = notes[nodeId];
    if (Array.isArray(nodeNotes)) {
      return nodeNotes.join('\n\n');
    }
    return nodeNotes || '';
  };

  // Helper to get image URL with placeholder fallback (matches cyAdapter logic)
  const getImageUrl = (node) => {
    let imageUrl = node.imageUrl;
    
    // Get the map's placeholder SVG (if available)
    const defaultPlaceholder = getDefaultPlaceholderSvg(mapName || 'default_map');
    
    // If no image URL or "unspecified", use placeholder or fallback
    if (!imageUrl || imageUrl === 'unspecified') {
      return defaultPlaceholder || TEST_ICON_SVG;
    }
    
    // If it's already a data URL (including TEST_ICON_SVG), use it directly
    if (imageUrl.startsWith('data:')) {
      return imageUrl;
    }
    
    // If it's a relative path and we have a CDN base URL, prepend CDN URL
    if (cdnBaseUrl && !imageUrl.startsWith('http')) {
      return `${cdnBaseUrl}/${imageUrl}`;
    }
    
    // Otherwise use the URL as-is (absolute URL)
    return imageUrl;
  };

  // Handle clicking on a node entry to navigate to it on the map
  const handleNodeClick = (nodeId) => {
    const cy = getCy?.();
    if (!cy) return;

    // Find the node element
    const nodeEle = cy.$(`#${CSS.escape(String(nodeId))}`);
    if (nodeEle.length === 0) return;

    // Pause viewport streaming during animation to prevent competing render cycles
    const hasStreamingControl = typeof cy.__pauseViewportStreaming === 'function';
    if (hasStreamingControl) {
      cy.__pauseViewportStreaming();
    }

    // Stop any ongoing animations
    cy.stop(true, true);

    // Close the modal first
    onClose();

    // Small delay to let modal close animation start
    setTimeout(() => {
      // Select the node
      cy.$(':selected').unselect();
      nodeEle.select();

      // Animate to fit the node with padding (same as HashtagSearchBar)
      cy.animate({
        fit: {
          eles: nodeEle,
          padding: 50
        }
      }, {
        duration: 400,
        easing: 'ease-in-out-cubic',
        queue: false,
        complete: () => {
          // Resume viewport streaming after animation completes
          if (hasStreamingControl) {
            cy.__resumeViewportStreaming();
          }
        }
      });
    }, 50);
  };

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
          maxWidth: '800px',
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          border: '2px solid #444',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px',
          position: 'sticky',
          top: '-30px',
          backgroundColor: '#1e1e1e',
          paddingTop: '0px',
          paddingBottom: '10px',
          zIndex: 1
        }}>
          <h2 style={{ margin: 0, color: '#4fc3f7', fontSize: '24px' }}>
            📖 Reading View
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
            title="Close Reading View"
          >
            ✕
          </button>
        </div>

        {/* Map info */}
        <div style={{ 
          marginBottom: '25px', 
          padding: '12px', 
          backgroundColor: 'rgba(79, 195, 247, 0.1)', 
          borderRadius: '8px', 
          border: '1px solid rgba(79, 195, 247, 0.3)',
          fontSize: '14px'
        }}>
          <strong>Map:</strong> {mapName || 'Unnamed Map'} • <strong>{nodesWithNotes.length}</strong> {nodesWithNotes.length === 1 ? 'entry' : 'entries'} with notes
        </div>

        {/* Node list */}
        {nodesWithNotes.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px 20px',
            color: '#888',
            fontSize: '16px'
          }}>
            No notes found in this map.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {nodesWithNotes.map((node, index) => {
              const noteText = getNodeNoteText(node.id);
              const imageUrl = getImageUrl(node);
              
              return (
                <div 
                  key={node.id}
                  onClick={() => handleNodeClick(node.id)}
                  style={{
                    padding: '20px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(79, 195, 247, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(79, 195, 247, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  }}
                >
                  {/* Node header with image and title */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '15px', 
                    marginBottom: '15px',
                    alignItems: 'flex-start'
                  }}>
                    {/* Node image - always show (uses placeholder if needed) */}
                    <div style={{
                      flexShrink: 0,
                      width: '80px',
                      height: '80px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      border: '2px solid rgba(255, 255, 255, 0.2)'
                    }}>
                      <img 
                        src={imageUrl}
                        alt={node.title || node.id}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    </div>
                    
                    {/* Node title and index */}
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '12px',
                        color: '#888',
                        marginBottom: '5px'
                      }}>
                        Entry {index + 1} of {nodesWithNotes.length}
                      </div>
                      <h3 style={{ 
                        margin: 0, 
                        color: '#4fc3f7',
                        fontSize: '20px',
                        fontWeight: 'bold'
                      }}>
                        {node.title || node.id}
                      </h3>
                    </div>
                  </div>

                  {/* Note text */}
                  <div style={{
                    fontSize: '15px',
                    lineHeight: '1.6',
                    color: '#e0e0e0'
                  }}>
                    <ul style={{
                      listStyleType: 'none',
                      paddingLeft: '20px',
                      margin: 0
                    }}>
                      {Array.isArray(notes[node.id]) ? (
                        notes[node.id].map((note, noteIndex) => (
                          <li key={noteIndex} style={{
                            marginBottom: '10px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}>
                            {note}
                          </li>
                        ))
                      ) : (
                        <li style={{
                          marginBottom: '10px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}>
                          {noteText}
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Close Button at bottom */}
        <div style={{ 
          textAlign: 'center', 
          marginTop: '30px',
          paddingTop: '20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
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
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReadingModal;
