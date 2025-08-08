import React, { useState, useCallback } from "react";

function NoteEditorModal({
  targetId,
  targetType, // 'node' or 'edge'
  notes, // array of note strings for this target
  onUpdateNotes,
  onClose
}) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newNoteValue, setNewNoteValue] = useState("");

  const handleStartEdit = useCallback((index) => {
    setEditingIndex(index);
    setEditingValue(notes[index]);
    setIsAddingNew(false);
  }, [notes]);

  const handleSaveEdit = useCallback(() => {
    if (editingValue.trim()) {
      const updatedNotes = [...notes];
      updatedNotes[editingIndex] = editingValue.trim();
      onUpdateNotes(targetId, updatedNotes);
    }
    setEditingIndex(null);
    setEditingValue("");
  }, [editingIndex, editingValue, notes, targetId, onUpdateNotes]);

  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditingValue("");
  }, []);

  const handleRemoveNote = useCallback((index) => {
    const updatedNotes = notes.filter((_, i) => i !== index);
    onUpdateNotes(targetId, updatedNotes);
  }, [notes, targetId, onUpdateNotes]);

  const handleStartAddNew = useCallback(() => {
    setIsAddingNew(true);
    setNewNoteValue("");
    setEditingIndex(null);
  }, []);

  const handleSaveNew = useCallback(() => {
    if (newNoteValue.trim()) {
      const updatedNotes = [...notes, newNoteValue.trim()];
      onUpdateNotes(targetId, updatedNotes);
    }
    setIsAddingNew(false);
    setNewNoteValue("");
  }, [newNoteValue, notes, targetId, onUpdateNotes]);

  const handleCancelNew = useCallback(() => {
    setIsAddingNew(false);
    setNewNoteValue("");
  }, []);

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
        borderTop: "2px solid #4caf50"
      }}
    >
      {/* Header */}
      <div style={{
        padding: "15px 20px",
        borderBottom: "1px solid #444",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "rgba(0, 0, 0, 0.95)"
      }}>
        <h3 style={{ margin: 0, color: "#4caf50" }}>
          Notes for {targetType}: {targetId}
        </h3>
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
          Close
        </button>
      </div>

      {/* Notes List */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px"
      }}>
        {notes.length === 0 && !isAddingNew && (
          <div style={{
            textAlign: "center",
            color: "#888",
            fontStyle: "italic",
            margin: "20px 0"
          }}>
            No notes yet. Click "Add New Note" to create one.
          </div>
        )}

        {notes.map((note, index) => (
          <div key={index} style={{
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid #444",
            borderRadius: "6px",
            padding: "12px",
            marginBottom: "10px",
            display: "flex",
            alignItems: "flex-start",
            gap: "10px"
          }}>
            {editingIndex === index ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                <textarea
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      handleSaveEdit();
                    } else if (e.key === 'Escape') {
                      handleCancelEdit();
                    }
                  }}
                  style={{
                    width: "100%",
                    minHeight: "60px",
                    padding: "8px",
                    background: "#333",
                    color: "#fff",
                    border: "1px solid #666",
                    borderRadius: "4px",
                    resize: "vertical",
                    fontSize: "14px",
                    fontFamily: "inherit"
                  }}
                  placeholder="Enter your note..."
                  autoFocus
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleSaveEdit}
                    style={{
                      background: "#4caf50",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      padding: "4px 8px",
                      cursor: "pointer",
                      fontSize: "12px"
                    }}
                  >
                    Save (Ctrl+Enter)
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    style={{
                      background: "#666",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      padding: "4px 8px",
                      cursor: "pointer",
                      fontSize: "12px"
                    }}
                  >
                    Cancel (Esc)
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{
                  flex: 1,
                  lineHeight: "1.4",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word"
                }}>
                  {note}
                </div>
                <div style={{ display: "flex", flexDirection: "row", gap: "4px" }}>
                  <button
                    onClick={() => handleStartEdit(index)}
                    style={{
                      background: "#2196f3",
                      color: "#fff",
                      border: "none",
                      borderRadius: "3px",
                      padding: "4px 8px",
                      cursor: "pointer",
                      fontSize: "11px",
                      minWidth: "45px"
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleRemoveNote(index)}
                    style={{
                      background: "#f44336",
                      color: "#fff",
                      border: "none",
                      borderRadius: "3px",
                      padding: "4px 8px",
                      cursor: "pointer",
                      fontSize: "11px",
                      minWidth: "45px"
                    }}
                  >
                    Remove
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {/* Add New Note Section */}
        {isAddingNew ? (
          <div style={{
            background: "rgba(76, 175, 80, 0.1)",
            border: "1px solid #4caf50",
            borderRadius: "6px",
            padding: "12px",
            marginBottom: "10px"
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <textarea
                value={newNoteValue}
                onChange={(e) => setNewNoteValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    handleSaveNew();
                  } else if (e.key === 'Escape') {
                    handleCancelNew();
                  }
                }}
                style={{
                  width: "100%",
                  minHeight: "60px",
                  padding: "8px",
                  background: "#333",
                  color: "#fff",
                  border: "1px solid #4caf50",
                  borderRadius: "4px",
                  resize: "vertical",
                  fontSize: "14px",
                  fontFamily: "inherit"
                }}
                placeholder="Enter your new note..."
                autoFocus
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={handleSaveNew}
                  disabled={!newNoteValue.trim()}
                  style={{
                    background: newNoteValue.trim() ? "#4caf50" : "#666",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    cursor: newNoteValue.trim() ? "pointer" : "not-allowed",
                    fontSize: "12px"
                  }}
                >
                  Add Note (Ctrl+Enter)
                </button>
                <button
                  onClick={handleCancelNew}
                  style={{
                    background: "#666",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    cursor: "pointer",
                    fontSize: "12px"
                  }}
                >
                  Cancel (Esc)
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={handleStartAddNew}
            disabled={editingIndex !== null}
            style={{
              background: editingIndex !== null ? "#666" : "#4caf50",
              color: "#fff",
              border: "1px solid #4caf50",
              borderRadius: "6px",
              padding: "12px 20px",
              cursor: editingIndex !== null ? "not-allowed" : "pointer",
              fontSize: "14px",
              width: "100%",
              marginTop: "10px"
            }}
          >
            + Add New Note
          </button>
        )}
      </div>
    </div>
  );
}

export default NoteEditorModal;
