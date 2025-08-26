import React, { useRef } from "react";

function BgImageModal({
  isOpen,
  onClose,
  bgImage,
  onChange,
  onLoadImage,
  onDeleteImage
}) {
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onLoadImage(file);
    }
    e.target.value = ""; // allow re-select
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      background: "rgba(0,0,0,0.5)",
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <div style={{
        background: "#222",
        color: "#fff",
        padding: "24px 32px",
        borderRadius: "10px",
        minWidth: "320px",
        boxShadow: "0 2px 16px rgba(0,0,0,0.3)"
      }}>
        <h2 style={{ marginTop: 0 }}>Background Image Settings</h2>
        <div style={{ marginBottom: "16px" }}>
          <button
            style={{ marginRight: "10px", padding: "6px 12px" }}
            onClick={() => fileInputRef.current.click()}
          >
            {bgImage.imageUrl ? "Change Image" : "Load Image"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          {bgImage.imageUrl && (
            <button
              style={{ padding: "6px 12px", background: "#d32f2f", color: "#fff", border: "none", borderRadius: "4px" }}
              onClick={onDeleteImage}
            >
              Delete Image
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <label>
            X: <input type="number" value={bgImage.x} onChange={e => onChange({ ...bgImage, x: Number(e.target.value) })} style={{ width: 60 }} />
          </label>
          <label>
            Y: <input type="number" value={bgImage.y} onChange={e => onChange({ ...bgImage, y: Number(e.target.value) })} style={{ width: 60 }} />
          </label>
          <label>
            Scale (%): <input type="number" value={bgImage.scale} min={1} max={1000} onChange={e => onChange({ ...bgImage, scale: Number(e.target.value) })} style={{ width: 60 }} />
          </label>
          <label>
            Opacity (%): <input type="number" value={bgImage.opacity} min={0} max={100} onChange={e => onChange({ ...bgImage, opacity: Number(e.target.value) })} style={{ width: 60 }} />
          </label>
        </div>
        <div style={{ marginTop: "18px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button onClick={onClose} style={{ padding: "6px 16px" }}>Close</button>
          <button onClick={() => onChange({ ...bgImage, x: 0, y: 0, scale: 100, opacity: 100 })} style={{ padding: "6px 16px", background: '#607d8b', color: '#fff', border: 'none', borderRadius: '4px' }}>Reset BG</button>
        </div>
      </div>
    </div>
  );
}

export default BgImageModal;
