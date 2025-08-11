import React, { useEffect } from "react";

function NoteViewerModal({
  targetId,
  notes, // array of note strings for this target
  onClose
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
        bottom: 0,
        left: 0,
        right: 0,
        height: "50vh",
        background: "rgba(0, 0, 0, 0.9)",
        color: "#fff",
        zIndex: 1002,
        display: "flex",
        flexDirection: "column",
        borderTop: "2px solid #2196f3"
      }}
    >
      {/* Header with close button */}
      <div style={{
        padding: "15px 20px",
        borderBottom: "1px solid #444",
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        background: "rgba(0, 0, 0, 0.95)"
      }}>
        <button
          onClick={onClose}
          style={{
            background: "#f44336",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            padding: "6px 12px",
            cursor: "pointer",
            fontSize: "14px"
          }}
        >
          ✕
        </button>
      </div>

      {/* Notes List */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px",
        fontFamily: "monospace"
      }}>
        {notes.length === 0 ? (
          <div style={{
            textAlign: "center",
            color: "#888",
            fontStyle: "italic",
            margin: "20px 0"
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
                wordBreak: "break-word"
              }}>
                {note}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default NoteViewerModal;
