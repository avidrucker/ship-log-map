// src/components/NoteViewerModal.jsx

/**
 * NoteViewerModal — Read-only note viewer
 *
 * Responsibilities
 * - Displays a node’s rendered note(s) for viewing mode.
 *
 * Props
 * - isOpen, onClose(), nodeId, text
 */

import React, { useEffect } from "react";
import TypewriterText from './TypewriterText.jsx';

// TODO: refactor out color styles to CSS stylesheet
const BLUE_OUTLINE_COLOR = "#5878b6";

function NoteViewerModal({
  targetId,
  notes, // array of note strings for this target
  onClose,
  shouldTypewriter = false
}) {
  // Add keyboard event listener for Escape key
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    // Add event listener when modal is open
    if (targetId) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [targetId, onClose]);

  if (!targetId) return null;

  return (
    <div 
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: 10,
        bottom: 10,
        left: 10,
        right: 10,
        zIndex: 1002,
        // background: "rgba(0,0,0,0.4)", // semi-transparent overlay
        display: "flex",
        alignItems: "flex-end", // align modal to bottom
        justifyContent: "center",
        pointerEvents: "none" // ensure modal doesn't block clicks
      }}
    >
      <div style={{
        background: "rgba(0,0,0,0.9)",
        border: `2px solid ${BLUE_OUTLINE_COLOR}`,
        padding: "10px",
        boxSizing: "border-box",
        flexDirection: "column",
        display: "flex",
        height: "50vh",
        width: "100%",
        position: "relative",
        pointerEvents: "auto" // enable interaction within modal
      }}>

      {/* Notes List */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        fontFamily: "monospace",
        // marginTop: "36px" // space for button
      }}
        className="hide-scrollbar"
      >
        {notes.length === 0 ? (
          <div style={{
            textAlign: "center",
            color: "#888",
            fontStyle: "italic",
            margin: "20px 0",
            fontSize: "14px"
          }}>
            No notes for this item.
          </div>
        ) : (
          <ul style={{
            listStyleType: "disc",
            paddingLeft: "20px",
            margin: 0
          }}>
            {notes.map((note, index) => (
              <li key={index} style={{
                marginBottom: "10px",
                lineHeight: "1.4",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: "14px",
              }}>
                {shouldTypewriter ? (<TypewriterText text={note} enabled />) : (note)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
    </div>
  );
}

export default NoteViewerModal;
