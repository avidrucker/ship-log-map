import React from "react";

function ErrorDisplay({ error, onClearError }) {
  if (!error) return null;

  return (
    <div style={{
      position: "absolute",
      bottom: "10px",
      left: "10px",
      right: "10px",
      zIndex: 1000,
      background: "rgba(211, 47, 47, 0.9)",
      color: "#fff",
      padding: "10px",
      borderRadius: "5px",
      fontFamily: "sans-serif",
      fontSize: "14px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "10px"
    }}>
      <div style={{ flex: 1 }}>
        <strong>Load Error:</strong> {error}
      </div>
      <button
        onClick={onClearError}
        style={{
          background: "transparent",
          border: "1px solid #fff",
          color: "#fff",
          padding: "2px 8px",
          cursor: "pointer",
          borderRadius: "3px",
          fontSize: "12px"
        }}
      >
        ×
      </button>
    </div>
  );
}

export default ErrorDisplay;
