import React from "react";

const NodeColorPicker = ({ selectedNodeIds, onNodeColorChange }) => {
  if (selectedNodeIds.length === 0) {
    return null;
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "5px"
    }}>
      <select
        value=""
        title="Change Node Color"
        onChange={(e) => {
          if (e.target.value) {
            onNodeColorChange(selectedNodeIds, e.target.value);
            e.target.value = ""; // Reset to placeholder
          }
        }}
        style={{
          padding: "6px 8px",
          fontSize: "12px",
          border: "1px solid #ccc",
          borderRadius: "4px",
          background: "#000",
          color: "#fff",
          cursor: "pointer"
        }}
      >
        <option value="">Color</option>
        <option value="gray">Gray</option>
        <option value="green">Green</option>
        <option value="orange">Orange</option>
        <option value="purple">Purple</option>
        <option value="red">Red</option>
        <option value="blue">Blue</option>
      </select>
    </div>
  );
};

export default NodeColorPicker;
