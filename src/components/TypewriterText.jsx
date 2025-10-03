// src/components/TypewriterText.jsx
import * as React from 'react';

/**
 * TypewriterText
 * - Renders full text immediately when disabled
 * - When enabled, reveals text progressively (client-only)
 */
export default function TypewriterText({
  text = '',
  enabled = false,
  intervalMs = 18,  // speed; tweak to taste
  className = ''
}) {
  const [out, setOut] = React.useState(() => (enabled ? '' : text));
  const iRef = React.useRef(0);
  const timerRef = React.useRef(null);

  React.useEffect(() => {
    // If not enabled, show all immediately
    if (!enabled) {
      setOut(text);
      return;
    }
    // Reset
    setOut('');
    iRef.current = 0;

    // Guard empty text
    if (!text || text.length === 0) return;

    timerRef.current = setInterval(() => {
      iRef.current += 1;
      if (iRef.current >= text.length) {
        setOut(text);
        clearInterval(timerRef.current);
        timerRef.current = null;
      } else {
        setOut(text.slice(0, iRef.current));
      }
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, text, intervalMs]);

  return <div className={className} style={{ whiteSpace: 'pre-wrap' }}>{out}</div>;
}
