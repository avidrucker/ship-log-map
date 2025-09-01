// src/bg/BgImageLayer.jsx

/**
 * Background Image Layer (canvas/DOM underlay)
 *
 * Responsibilities
 * - Renders a panning/zooming-independent backdrop beneath the Cytoscape graph.
 * - Applies user-controlled transforms: x/y translation, scale, opacity.
 * - Can be toggled visible; treated as part of map state for import/export.
 *
 * Props
 * - { src, x, y, scale, opacity, visible }
 * - onTransformChange({ x, y, scale, opacity })
 *
 * Gotchas
 * - Keep transforms independent from Cytoscape zoom to maintain predictable UX.
 * - Only square assets are allowed upstream (UI enforces; this assumes validity).
 */

import React from "react";
import { bgCssTransform } from "./math.js";
import { printDebug } from "../utils/debug.js";

/**
 * Renders the background image in the same transform space as Cytoscape:
 *   screen = pan + zoom * world
 * where world = [tx, ty] + s * [image_px].
 *
 * IMPORTANT:
 * - We do NOT use width/height:100% or object-fit.
 * - We pin transform origin to top-left so math is exact.
 * - We compose: translate( pan + zoom*tx ) scale( zoom*s )
 */
export default function BgImageLayer({
  url,
  visible = true,
  opacity = 100,
  pan = { x: 0, y: 0 },
  zoom = 1,
  // calibration: world offset and world-per-image-pixel scale
  calibration = { tx: 0, ty: 0, s: 1 },
  style = {}
}) {
    printDebug("BgImageLayer render", { url, visible, opacity, pan, zoom, calibration, style });
  if (!url || !visible) return null;

  const { tx = 0, ty = 0, s = 1 } = calibration;
  const transform = bgCssTransform({
    panX: pan.x ?? 0,
    panY: pan.y ?? 0,
    zoom: zoom ?? 1,
    tx,
    ty,
    s
  });

  return (
    <img
      src={url}
      alt=""
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        // Let natural image size + CSS scale govern dimensions.
        // This avoids container-dependent “contain/cover” resizing.
        pointerEvents: "none",
        zIndex: 0,
        opacity: opacity / 100,
        transformOrigin: "0 0",
        transform,
        // Allow external overrides if needed
        ...style
      }}
    />
  );
}
