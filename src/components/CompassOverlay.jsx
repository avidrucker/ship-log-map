import React from 'react';

export default function CompassOverlay({ orientation }) {
  return (
    <div style={{ position: 'absolute', bottom: '10px', right: '10px', zIndex: 900, width: '60px', height: '60px', pointerEvents: 'none', opacity: 0.9 }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: `rotate(${orientation}deg)` }}>
        <circle cx="50" cy="50" r="48" fill="rgba(0,0,0,0.4)" stroke="#fff" strokeWidth="2" />
        <polygon points="50,15 60,50 50,45 40,50" fill="#ff5252" />
        <polygon points="50,85 40,50 50,55 60,50" fill="#fff" />
        <text x="50" y="20" textAnchor="middle" fontSize="12" fill="#fff" fontFamily="sans-serif">N</text>
        <text x="50" y="95" textAnchor="middle" fontSize="12" fill="#fff" fontFamily="sans-serif">S</text>
        <text x="15" y="55" textAnchor="middle" fontSize="12" fill="#fff" fontFamily="sans-serif">W</text>
        <text x="85" y="55" textAnchor="middle" fontSize="12" fill="#fff" fontFamily="sans-serif">E</text>
      </svg>
    </div>
  );
}
