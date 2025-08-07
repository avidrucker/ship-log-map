import React from "react";

function NodeRenameModal({
  renamingNodeId,
  renameInputValue,
  setRenameInputValue,
  onSubmitRename,
  onCancelRename
}) {
  if (!renamingNodeId) return null;

  return (
    <div 
      data-rename-modal="true"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "10px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1001,
        background: "rgba(0, 0, 0, 0.9)",
        color: "#fff",
        padding: "15px",
        borderRadius: "8px",
        border: "2px solid #9c27b0",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        minWidth: "300px"
      }}
    >
      <div style={{ fontWeight: "bold", textAlign: "center" }}>
        Rename Node: {renamingNodeId}
      </div>
      
      <input
        type="text"
        value={renameInputValue}
        onChange={(e) => setRenameInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSubmitRename();
          } else if (e.key === 'Escape') {
            onCancelRename();
          }
        }}
        style={{
          padding: "8px",
          fontSize: "14px",
          border: "1px solid #ccc",
          borderRadius: "4px",
          outline: "none"
        }}
        placeholder="Enter new node name..."
        autoFocus
      />
      
      <div style={{
        display: "flex",
        gap: "10px",
        justifyContent: "center"
      }}>
        <button
          onClick={onSubmitRename}
          style={{
            padding: "6px 12px",
            background: "#4caf50",
            color: "#fff",
            border: "1px solid #388e3c",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px"
          }}
        >
          Rename
        </button>
        
        <button
          onClick={onCancelRename}
          style={{
            padding: "6px 12px",
            background: "#f44336",
            color: "#fff",
            border: "1px solid #d32f2f",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px"
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default NodeRenameModal;
