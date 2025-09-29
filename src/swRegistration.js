// src/swRegistration.js
// Light-weight Service Worker registration + update prompt hook

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  // ✅ Skip in dev
  if (import.meta.env.DEV) return;

  // Use BASE_URL so this works in dev and on GitHub Pages subpath
  const swUrl = `${import.meta.env.BASE_URL}service-worker.js`;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl).then((reg) => {
      // Listen for new SW installation
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          // When the new SW is installed and we already have a controller, an update is ready
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            // Option A: simple console notice (replace with your toast UI)
            // To apply immediately:
            //   promptUserToReload(reg);
            console.log('[PWA] New version available. Reload to update.');
          }
        });
      });

      // Optional: listen for controller changes and reload once the new SW takes control
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Uncomment to auto-reload when activating a new service worker
        // window.location.reload();
      });
    }).catch((err) => {
      console.warn('[PWA] SW registration failed:', err);
    });
  });
}

// If you build a toast UI, you can call this from it:
export function promptUserToReload(reg) {
  if (reg.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
