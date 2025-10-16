// src/components/DebugModal.jsx

/**
 * DebugModal — Developer tooling & diagnostics
 *
 * Responsibilities
 * - Surface raw state, event logs, performance counters, test assets loader.
 * - Useful for troubleshooting import/load/caching/image-pipeline issues.
 *
 * Props
 * - isOpen, onClose, state snapshots, test asset hooks.
 */

import React, { useState, useEffect } from "react";
import { GRAYSCALE_IMAGES } from "../config/features.js";
import { printDebug } from "../utils/debug.js";
import { clearAllImageCaches, getImageCacheStats } from "../utils/imageLoader.js";
import swLogger from "../utils/swLogger.js";

function DebugModal({ isOpen, onClose, debugData, getCytoscapeInstance }) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [cacheClearSuccess, setCacheClearSuccess] = useState(false);
  const [allCacheClearSuccess, setAllCacheClearSuccess] = useState(false);
  const [debugGraphSuccess, setDebugGraphSuccess] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsJson, setDiagnosticsJson] = useState('');
  const [clearedDiagnostics, setClearedDiagnostics] = useState(false);
  const [showSWLogs, setShowSWLogs] = useState(false);
  const [swLogs, setSwLogs] = useState([]);
  const [swLogFilter, setSwLogFilter] = useState('all'); // 'all', 'errors', 'cache', 'fetch'
  const [swLogsClearSuccess, setSwLogsClearSuccess] = useState(false);

  // Load SW logs when modal opens or logs section is shown
  useEffect(() => {
    if (isOpen && showSWLogs) {
      setSwLogs(swLogger.getLogs());
    }
  }, [isOpen, showSWLogs]);

  if (!isOpen) return null;

  const formattedData = JSON.stringify(debugData, null, 2);

  const handleClearGrayscaleCache = async () => {
    try {
      const { clearGrayscaleCache } = await import('../graph/cyAdapter.js');
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
      const { debugPrintEntireGraph } = await import('../graph/cyAdapter.js');
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

  const handleToggleDiagnostics = async () => {
    try {
      const { getImageLoadDiagnostics } = await import('../utils/imageLoader.js');
      const diag = getImageLoadDiagnostics();
      setDiagnosticsJson(JSON.stringify(diag, null, 2));
      setShowDiagnostics(!showDiagnostics);
    } catch (e) { console.error('Failed to load diagnostics', e); }
  };
  const handleClearDiagnostics = async () => {
    try {
      const { clearImageLoadDiagnostics } = await import('../utils/imageLoader.js');
      clearImageLoadDiagnostics();
      setClearedDiagnostics(true);
      setTimeout(()=> setClearedDiagnostics(false), 1500);
      if (showDiagnostics) setDiagnosticsJson('{}');
    } catch (e) { console.error('Failed to clear diagnostics', e); }
  };

  const handleToggleSWLogs = () => {
    const newState = !showSWLogs;
    setShowSWLogs(newState);
    if (newState) {
      setSwLogs(swLogger.getLogs());
    }
  };

  const handleClearSWLogs = () => {
    swLogger.clearLogs();
    setSwLogs([]);
    setSwLogsClearSuccess(true);
    setTimeout(() => setSwLogsClearSuccess(false), 1500);
  };

  const handleRefreshSWLogs = () => {
    setSwLogs(swLogger.getLogs());
  };

  const getFilteredSWLogs = () => {
    if (swLogFilter === 'all') return swLogs;
    if (swLogFilter === 'errors') return swLogs.filter(log => log.type === 'error' || log.type === 'warn');
    if (swLogFilter === 'cache') return swLogs.filter(log => log.category === 'cache');
    if (swLogFilter === 'fetch') return swLogs.filter(log => log.category === 'fetch');
    return swLogs;
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
          maxWidth: "90%",
          maxHeight: "90vh",
          width: "900px",
          display: "flex",
          flexDirection: "column",
          color: "#fff",
          overflow: "hidden"
        }}
      >
        {/* Fixed Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 20px 15px 20px",
            borderBottom: "1px solid #444",
            flexShrink: 0
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

        {/* Scrollable Content Area */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "20px"
          }}
        >

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

          {/* Diagnostics toggle and clear */}
          <button
            onClick={handleToggleDiagnostics}
            style={{
              padding: "8px 16px",
              backgroundColor: showDiagnostics ? "#555" : "#607d8b",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            {showDiagnostics ? "Hide Image Diagnostics" : "Show Image Diagnostics"}
          </button>
          <button
            onClick={handleClearDiagnostics}
            style={{
              padding: "8px 16px",
              backgroundColor: clearedDiagnostics ? "#4caf50" : "#546e7a",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            {clearedDiagnostics ? "✓ Diagnostics Cleared" : "Clear Diagnostics"}
          </button>

          {/* Service Worker Logs */}
          <button
            onClick={handleToggleSWLogs}
            style={{
              padding: "8px 16px",
              backgroundColor: showSWLogs ? "#555" : "#ff6f00",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            {showSWLogs ? "Hide SW Logs" : "Show SW Logs"}
          </button>
          {showSWLogs && (
            <>
              <button
                onClick={handleRefreshSWLogs}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#2196f3",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                🔄 Refresh Logs
              </button>
              <button
                onClick={handleClearSWLogs}
                style={{
                  padding: "8px 16px",
                  backgroundColor: swLogsClearSuccess ? "#4caf50" : "#f44336",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                {swLogsClearSuccess ? "✓ SW Logs Cleared" : "Clear SW Logs"}
              </button>
              <select
                value={swLogFilter}
                onChange={(e) => setSwLogFilter(e.target.value)}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#333",
                  color: "#fff",
                  border: "1px solid #555",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                <option value="all">All Logs</option>
                <option value="errors">Errors/Warnings</option>
                <option value="cache">Cache Ops</option>
                <option value="fetch">Network Fetch</option>
              </select>
            </>
          )}

            {/* Quick map navigation buttons */}
          <button
            style={{
              padding: "8px 16px",
              backgroundColor: "#1976d2",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px"
            }}
            onClick={() => window.location.href = "http://localhost:5173/ship-log-map/?map=https%3A%2F%2Favidrucker.github.io%2Fimg-test-1%2FGaia%2520Yoga%2Fgaia_yoga.json&canedit=true"}
          >
            Go to Gaia Yoga Map
          </button>
          <button
            style={{
              padding: "8px 16px",
              backgroundColor: "#388e3c",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px"
            }}
            onClick={() => window.location.href = "http://localhost:5173/ship-log-map/?map=https%3A%2F%2Favidrucker.github.io%2Fimg-test-1%2FOuter%2520Wilds%2Fouter_wilds.json&canedit=true"}
          >
            Go to Outer Wilds Map
          </button>
        </div>

        {/* Cache statistics */}
        <div style={{ marginBottom: "10px", fontSize: "12px", color: "#ccc" }}>
          <div>Image Cache: {cacheStats.totalImages} images cached</div>
          <div>CDN URL: {cacheStats.cdnBaseUrl || 'Not set'}</div>
          <div>Cache size: ~{Math.round(cacheStats.cacheSize / 1024)}KB</div>
          <div>Default Placeholder: {cacheStats.hasDefaultPlaceholder ? `Loaded (${cacheStats.defaultPlaceholderLength} chars)` : 'Not loaded'} </div>
          <div>Diagnostics Entries: {cacheStats.diagnosticsCount}</div>
          {showSWLogs && (
            <>
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #444' }}>
                <strong>Service Worker Logs:</strong> {swLogs.length} entries
              </div>
              <div>
                Cache Hits: {swLogger.getStats().cacheHits} | 
                Cache Misses: {swLogger.getStats().cacheMisses} | 
                Errors: {swLogger.getStats().errors}
              </div>
            </>
          )}
        </div>

        {showSWLogs && (
          <div style={{
            minHeight: '200px',
            backgroundColor: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: '4px',
            padding: '10px',
            marginBottom: '10px'
          }}>
            <div style={{ fontSize: '12px', color: '#bbb', marginBottom: '8px', fontWeight: 'bold' }}>
              Service Worker Logs ({getFilteredSWLogs().length} entries)
            </div>
            <div style={{ fontSize: '11px', lineHeight: 1.5 }}>
              {getFilteredSWLogs().length === 0 ? (
                <div style={{ color: '#888', fontStyle: 'italic' }}>No logs yet. Logs will appear here as the service worker operates.</div>
              ) : (
                getFilteredSWLogs().map((log, idx) => {
                  const time = new Date(log.timestamp).toLocaleTimeString();
                  let color = '#e6edf3';
                  let icon = 'ℹ️';
                  
                  if (log.type === 'error') { color = '#ff6b6b'; icon = '❌'; }
                  else if (log.type === 'warn') { color = '#ffa500'; icon = '⚠️'; }
                  else if (log.type === 'success') { color = '#4caf50'; icon = '✅'; }
                  
                  return (
                    <div key={idx} style={{ 
                      marginBottom: '6px', 
                      paddingBottom: '6px', 
                      borderBottom: '1px solid #21262d',
                      color 
                    }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'start' }}>
                        <span style={{ flexShrink: 0 }}>{icon}</span>
                        <span style={{ color: '#8b949e', fontSize: '10px', flexShrink: 0 }}>{time}</span>
                        <span style={{ 
                          backgroundColor: log.category === 'cache' ? '#1e3a5f' : 
                                         log.category === 'fetch' ? '#2d1e3f' :
                                         log.category === 'install' ? '#1e3f1e' : '#3a3a3a',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          fontSize: '10px',
                          flexShrink: 0
                        }}>
                          {log.category}
                        </span>
                        <span style={{ flex: 1, wordBreak: 'break-word' }}>{log.message}</span>
                      </div>
                      {log.data && (
                        <div style={{ 
                          marginTop: '4px', 
                          marginLeft: '24px',
                          fontSize: '10px', 
                          color: '#6e7681',
                          maxHeight: '60px',
                          overflow: 'auto'
                        }}>
                          {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {showDiagnostics && (
          <div style={{
            minHeight: '150px',
            backgroundColor: '#141a21',
            border: '1px solid #30363d',
            borderRadius: '4px',
            padding: '10px',
            marginBottom: '10px'
          }}>
            <div style={{ fontSize: '12px', color: '#bbb', marginBottom: '6px' }}>Image Load Diagnostics</div>
            <pre style={{ margin: 0, fontSize: '11px', lineHeight: 1.3 }}>{diagnosticsJson}</pre>
          </div>
        )}

        {/* JSON content */}
        <div
          style={{
            minHeight: "300px",
            backgroundColor: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: "4px",
            padding: "15px",
            marginTop: "10px"
          }}
        >
          <div style={{ fontSize: '12px', color: '#bbb', marginBottom: '8px', fontWeight: 'bold' }}>
            App State JSON
          </div>
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
    </div>
  );
}

export default DebugModal;
