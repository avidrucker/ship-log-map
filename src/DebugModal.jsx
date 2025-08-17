import React, { useState } from "react";
import { GRAYSCALE_IMAGES } from "./config/features.js";
import { printDebug } from "./utils/debug.js";
import { clearAllImageCaches, getImageCacheStats } from "./utils/imageLoader.js";

function DebugModal({ isOpen, onClose, debugData, getCytoscapeInstance }) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [cacheClearSuccess, setCacheClearSuccess] = useState(false);
  const [allCacheClearSuccess, setAllCacheClearSuccess] = useState(false);
  const [debugGraphSuccess, setDebugGraphSuccess] = useState(false);

  if (!isOpen) return null;

  const formattedData = JSON.stringify(debugData, null, 2);

  const handleClearGrayscaleCache = async () => {
    try {
      const { clearGrayscaleCache } = await import('./graph/cyAdapter.js');
      clearGrayscaleCache();
      setCacheClearSuccess(true);
      setTimeout(() => setCacheClearSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to clear grayscale cache:", err);
    }
  };

  const handleClearAllImageCaches = async () => {
    try {
      clearAllImageCaches();
      setAllCacheClearSuccess(true);
      setTimeout(() => setAllCacheClearSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to clear all image caches:", err);
    }
  };

  const handleDebugPrintGraph = async () => {
    try {
      if (!getCytoscapeInstance) {
        printDebug('🔍 [DEBUG] No getCytoscapeInstance function provided');
        return;
      }
      
      const cy = getCytoscapeInstance();
      const { debugPrintEntireGraph } = await import('./graph/cyAdapter.js');
      debugPrintEntireGraph(cy);
      setDebugGraphSuccess(true);
      setTimeout(() => setDebugGraphSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to debug print graph:", err);
    }
  };

  const cacheStats = getImageCacheStats();

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(formattedData);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = formattedData;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (fallbackErr) {
        console.error("Fallback copy failed:", fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleBackgroundClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 2000
      }}
      onClick={handleBackgroundClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        style={{
          backgroundColor: "#1e1e1e",
          border: "1px solid #444",
          borderRadius: "8px",
          padding: "20px",
          maxWidth: "80%",
          maxHeight: "80%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          color: "#fff"
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "15px",
            borderBottom: "1px solid #444",
            paddingBottom: "10px"
          }}
        >
          <h2 style={{ margin: 0, color: "#fff", fontSize: "18px" }}>
            Debug - App State
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              fontSize: "20px",
              padding: "0",
              width: "30px",
              height: "30px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            title="Close (ESC)"
          >
            ×
          </button>
        </div>

        {/* Copy button and cache management */}
        <div style={{ marginBottom: "10px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={handleCopyToClipboard}
            style={{
              padding: "8px 16px",
              backgroundColor: copySuccess ? "#4caf50" : "#2196f3",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            {copySuccess ? "✓ Copied!" : "📋 Copy to Clipboard"}
          </button>
          
          {/* Grayscale cache management */}
          {GRAYSCALE_IMAGES && (
            <button
              onClick={handleClearGrayscaleCache}
              style={{
                padding: "8px 16px",
                backgroundColor: cacheClearSuccess ? "#4caf50" : "#ff9800",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "14px"
              }}
            >
              {cacheClearSuccess ? "✓ Grayscale Cache Cleared!" : "Clear Grayscale Cache"}
            </button>
          )}
          
          {/* All image caches management */}
          <button
            onClick={handleClearAllImageCaches}
            style={{
              padding: "8px 16px",
              backgroundColor: allCacheClearSuccess ? "#4caf50" : "#f44336",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            {allCacheClearSuccess ? "✓ All Caches Cleared!" : "Clear All Image Caches"}
          </button>
          
          {/* Debug graph print */}
          <button
            onClick={handleDebugPrintGraph}
            style={{
              padding: "8px 16px",
              backgroundColor: debugGraphSuccess ? "#4caf50" : "#9c27b0",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            {debugGraphSuccess ? "✓ Graph Logged to Console!" : "🔍 Debug Print Graph"}
          </button>
        </div>

        {/* Cache statistics */}
        <div style={{ marginBottom: "10px", fontSize: "12px", color: "#ccc" }}>
          <div>Image Cache: {cacheStats.totalImages} images cached</div>
          <div>CDN URL: {cacheStats.cdnBaseUrl || 'Not set'}</div>
          <div>Cache size: ~{Math.round(cacheStats.cacheSize / 1024)}KB</div>
        </div>

        {/* JSON content */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            backgroundColor: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: "4px",
            padding: "15px"
          }}
        >
          <pre
            style={{
              margin: 0,
              fontFamily: "Consolas, Monaco, 'Courier New', monospace",
              fontSize: "12px",
              lineHeight: "1.4",
              color: "#e6edf3",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word"
            }}
          >
            {formattedData}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default DebugModal;
