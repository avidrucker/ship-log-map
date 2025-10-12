// src/components/TypewriterText.jsx
import * as React from 'react';

/**
 * TypewriterText
 * - Renders full text immediately when disabled
 * - When enabled, reveals text progressively (client-only)
 * - Uses consistent speed: 10ms per character
 */
export default function TypewriterText({
  text = '',
  enabled = false,
  msPerChar = 30, // ← Speed in milliseconds per character
  className = ''
}) {
  const [out, setOut] = React.useState(() => (enabled ? '' : text));
  const rafRef = React.useRef(null);
  const startTimeRef = React.useRef(null);

  React.useEffect(() => {
    if (!enabled) {
      setOut(text);
      return;
    }

    setOut('');
    startTimeRef.current = null;

    if (!text || text.length === 0) return;

    // Calculate total duration based on character count
    const totalDuration = text.length * msPerChar;

    const animate = (currentTime) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime;
      }

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / totalDuration, 1);
      const charCount = Math.floor(progress * text.length);

      setOut(text.slice(0, charCount));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setOut(text); // Ensure full text
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled, text, msPerChar]);

  return <div className={className} style={{ whiteSpace: 'pre-wrap' }}>{out}</div>;
}