// src/components/FpsCounter.jsx

/**
 * FpsCounter — Lightweight FPS/perf indicator
 *
 * Responsibilities
 * - Measures/draws current frame rate for animation/perf tuning.
 *
 * Notes
 * - Intended for future animation work; safe to disable in production.
 */

import React, { useRef, useEffect, useState } from "react";

/**
 * FpsCounter - Displays the current frame rate (FPS) in real time.
 * Only renders if DEV_MODE is true (handled by parent).
 */
function FpsCounter() {
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const animationFrameRef = useRef();

  useEffect(() => {
    let running = true;
    function tick() {
      frameCountRef.current += 1;
      const now = performance.now();
      const elapsed = now - lastTimeRef.current;
      if (elapsed >= 500) {
        // Update FPS every 0.5s for smoother display
        setFps(Math.round((frameCountRef.current * 1000) / elapsed));
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }
      if (running) {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    }
    animationFrameRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div style={{
      background: "rgba(0,0,0,0.5)",
      color: "#fff",
      padding: "4px 10px",
      borderRadius: "4px",
      fontSize: "12px",
      fontFamily: "monospace",
      textAlign: "center",
      minWidth: "60px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
      border: "1px solid #333"
    }}>
      FPS: <span style={{ color: fps >= 50 ? "#4caf50" : fps >= 30 ? "#ff9800" : "#f44336" }}>{fps}</span>
    </div>
  );
}

export default FpsCounter;
