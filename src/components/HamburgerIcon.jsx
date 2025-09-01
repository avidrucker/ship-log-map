// src/components/HamburgerIcon.jsx

// SVG Hamburger Icon Component used for toggling open menu panels
export function HamburgerIcon({ color = '#fff', size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="6" width="18" height="2" fill={color}></rect>
      <rect x="3" y="11" width="18" height="2" fill={color}></rect>
      <rect x="3" y="16" width="18" height="2" fill={color}></rect>
    </svg>
  );
}