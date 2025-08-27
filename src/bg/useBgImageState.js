// src/bg/useBgImageState.js
import { useCallback, useEffect, useState } from "react";
import { printDebug } from "../utils/debug";

/** LocalStorage key */
const LS_KEY = "shipLogBgImage";

/** Shape (documented for clarity)
 * {
 *   imageUrl: string,
 *   x: number,      // world offset
 *   y: number,      // world offset
 *   scale: number,  // percent (100 = 1:1 world-per-image-px)
 *   opacity: number,// 0..100
 *   visible: boolean
 * }
 */

function loadFromLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // basic defensive defaults
    return {
      included: typeof parsed.included === "boolean" ? parsed.included : false,
      imageUrl: parsed.imageUrl ?? "",
      x: Number.isFinite(parsed.x) ? parsed.x : 0,
      y: Number.isFinite(parsed.y) ? parsed.y : 0,
      scale: Number.isFinite(parsed.scale) ? parsed.scale : 100,
      opacity: Number.isFinite(parsed.opacity) ? parsed.opacity : 100,
      visible: typeof parsed.visible === "boolean" ? parsed.visible : false
    };
  } catch {
    return null;
  }
}

function saveToLocal(bg) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(bg));
  } catch {
    printDebug("Failed to save bg image to localStorage")
  }
}

/** Public hook API
 * - bgImage: state object
 * - setBgImage: raw setter (for power users / modal)
 * - modalOpen + open/close
 * - helpers: change, loadImage(file), deleteImage(), toggleVisible()
 */
export function useBgImageState() {
  const [bgImage, setBgImage] = useState(() => loadFromLocal() ?? ({
    imageUrl: "",
    included: false,
    x: 0,
    y: 0,
    scale: 100,
    opacity: 100,
    visible: false
  }));

  const [bgImageModalOpen, setBgImageModalOpen] = useState(false);

  // persist
  useEffect(() => { saveToLocal(bgImage); }, [bgImage]);

  // modal controls
  const openBgImageModal = useCallback(() => setBgImageModalOpen(true), []);
  const closeBgImageModal = useCallback(() => setBgImageModalOpen(false), []);

  // ergonomic updaters used by UI
  const changeBgImage = useCallback((next) => setBgImage(next), []);
  const loadImageFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setBgImage((bg) => ({
        ...bg,
        included: true,
        imageUrl: e.target.result,
        visible: true
      }));
    };
    reader.readAsDataURL(file);
  }, []);
  const deleteImage = useCallback(() => {
    setBgImage((bg) => ({ ...bg, included: false, imageUrl: "", visible: false }));
  }, []);
  const toggleVisible = useCallback(() => {
    setBgImage((bg) => ({ ...bg, visible: !bg.visible }));
  }, []);

  // handy derived mapping for BgImageLayer “calibration”
  const calibration = {
    tx: bgImage.x,
    ty: bgImage.y,
    s: (bgImage.scale ?? 100) / 100
  };

  return {
    bgImage,
    setBgImage,              // raw setter (kept for flexibility)
    bgImageModalOpen,
    openBgImageModal,
    closeBgImageModal,
    changeBgImage,
    loadImageFile,
    deleteImage,
    toggleVisible,
    calibration
  };
}
