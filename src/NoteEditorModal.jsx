import React, { useState, useCallback, useEffect } from "react";
import { processImageFile, saveImageFiles } from "./utils/imageUtils.js";

function NoteEditorModal({
  targetId,
  targetType, // 'node' or 'edge'
  currentTitle,
  currentImageUrl, // Add this prop for showing current image status
  notes, // array of note strings for this target
  mapName, // Current map name for image storage
  onUpdateNotes,
  onUpdateTitle,
  onUpdateImage, // New prop for updating node image
  onClose
}) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newNoteValue, setNewNoteValue] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(currentTitle);
  
  // Image import state
  const [isImportingImage, setIsImportingImage] = useState(false);
  const [imageImportError, setImageImportError] = useState(null);

  // Add keyboard event listener for Escape key
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        // Check if we're editing the title and the title input has focus
        if (isEditingTitle && event.target.tagName === 'INPUT') {
          // Let the title input's onKeyDown handle this (it will call handleCancelTitleEdit)
          return;
        }
        
        // Check if we're editing a note and a textarea has focus
        if ((editingIndex !== null || isAddingNew) && event.target.tagName === 'TEXTAREA') {
          // Let the textarea's onKeyDown handle this (it will call handleCancelEdit or handleCancelNew)
          return;
        }
        
        // If no input/textarea has focus, close the modal
        if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
          event.preventDefault();
          onClose();
        }
      }
    };

    // Add event listener when modal is open
    if (targetId) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [targetId, onClose, isEditingTitle, editingIndex, isAddingNew]);

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

  const handleStartEditTitle = useCallback(() => {
    setIsEditingTitle(true);
    setTitleValue(currentTitle);
  }, [currentTitle]);

  const handleSaveTitle = useCallback(() => {
    if (titleValue.trim() && titleValue.trim() !== currentTitle) {
      onUpdateTitle(targetId, targetType, titleValue.trim());
    }
    setIsEditingTitle(false);
  }, [titleValue, currentTitle, targetId, targetType, onUpdateTitle]);

  const handleCancelTitleEdit = useCallback(() => {
    setIsEditingTitle(false);
    setTitleValue(currentTitle);
  }, [currentTitle]);

  // Image import handler
  const handleImageImport = useCallback(async () => {
    if (targetType !== 'node') return; // Only nodes can have custom images
    
    try {
      setIsImportingImage(true);
      setImageImportError(null);
      
      // Request directory access first (while in user gesture context)
      let directoryHandle = null;
      try {
        if (window.showDirectoryPicker) {
          // Try to get directory access for filesystem saving
          directoryHandle = await window.showDirectoryPicker({
            mode: 'readwrite'
          });
        }
      } catch (dirError) {
        console.warn('Directory access not granted, will use data URLs only:', dirError.message);
      }
      
      // Create file input programmatically
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/png,image/jpeg,image/webp';
      fileInput.style.display = 'none';
      
      // Handle file selection
      fileInput.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) {
          setIsImportingImage(false);
          return;
        }
        
        try {
          // Process the image (validate square, create thumbnails)
          const processedImage = await processImageFile(file);
          
          // Save to public directory and get data URL
          const result = await saveImageFiles(targetId, processedImage, mapName, directoryHandle);
          
          if (result.success) {
            // Update the node's image URL with the data URL
            onUpdateImage(targetId, result.fullSizePath);
            setImageImportError(null);
            console.log('Image imported successfully for node:', targetId);
          }
        } catch (error) {
          console.error('Image import error:', error);
          setImageImportError(error.message);
        } finally {
          setIsImportingImage(false);
          // Clean up the file input
          if (document.body.contains(fileInput)) {
            document.body.removeChild(fileInput);
          }
        }
      };
      
      // Handle cancel
      fileInput.oncancel = () => {
        setIsImportingImage(false);
        if (document.body.contains(fileInput)) {
          document.body.removeChild(fileInput);
        }
      };
      
      // Trigger file selection
      document.body.appendChild(fileInput);
      fileInput.click();
      
    } catch (error) {
      console.error('Image import setup error:', error);
      setImageImportError(error.message);
      setIsImportingImage(false);
    }
  }, [targetId, targetType, onUpdateImage, mapName]);

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
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ color: "#4caf50", fontSize: "14px" }}>
            Notes for {targetType}:
          </span>
          {isEditingTitle ? (
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <input
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") handleCancelTitleEdit();
                }}
                style={{
                  background: "#333",
                  color: "#fff",
                  border: "1px solid #4caf50",
                  padding: "4px 8px",
                  borderRadius: "3px",
                  fontSize: "16px",
                  fontWeight: "bold",
                  minWidth: "120px"
                }}
                autoFocus
              />
              <button
                onClick={handleSaveTitle}
                style={{
                  background: "#4caf50",
                  color: "#fff",
                  border: "none",
                  borderRadius: "3px",
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: "12px"
                }}
              >
                ✓
              </button>
              <button
                onClick={handleCancelTitleEdit}
                style={{
                  background: "#666",
                  color: "#fff",
                  border: "none",
                  borderRadius: "3px",
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: "12px"
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <h3 
              style={{ 
                margin: 0, 
                color: "#4caf50",
                cursor: targetType === "node" ? "pointer" : "default",
                textDecoration: targetType === "node" ? "underline dotted" : "none"
              }}
              onClick={targetType === "node" ? handleStartEditTitle : undefined}
              title={targetType === "node" ? "Click to edit title" : ""}
            >
              {currentTitle || targetId}
            </h3>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Image Import Button - Only for nodes */}
          {targetType === 'node' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
              <button
                onClick={handleImageImport}
                disabled={isImportingImage}
                style={{
                  background: isImportingImage ? "#666" : "#9c27b0",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "6px 12px",
                  cursor: isImportingImage ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  opacity: isImportingImage ? 0.7 : 1
                }}
                title="Import a custom square image for this node"
              >
                {isImportingImage ? "Importing..." : (currentImageUrl && currentImageUrl.startsWith('data:') ? "Change Image" : "Import Image")}
              </button>
              {currentImageUrl && currentImageUrl.startsWith('data:') && (
                <div style={{
                  fontSize: "10px",
                  color: "#4caf50",
                  textAlign: "center"
                }}>
                  ✓ Custom image set
                </div>
              )}
            </div>
          )}
          
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
      </div>

      {/* Error display for image import */}
      {imageImportError && (
        <div style={{
          background: "rgba(244, 67, 54, 0.1)",
          border: "1px solid #f44336",
          borderRadius: "4px",
          padding: "10px",
          margin: "10px 20px",
          color: "#f44336",
          fontSize: "14px"
        }}>
          <strong>Image Import Error:</strong> {imageImportError}
        </div>
      )}

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
