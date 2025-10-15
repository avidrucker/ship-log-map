export function registerSW() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[PWA] Service Worker not supported');
    return;
  }

  // ✅ Skip in dev (unless you want to test)
  if (import.meta.env.DEV) {
    console.log('[PWA] Skipping SW registration in dev mode');
    return;
  }

  const swUrl = `${import.meta.env.BASE_URL}service-worker.js`;
  console.log('[PWA] Registering service worker:', swUrl);

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl).then((reg) => {
      console.log('[PWA] Service worker registered successfully:', reg.scope);
      
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        
        console.log('[PWA] New service worker installing...');
        
        nw.addEventListener('statechange', () => {
          console.log('[PWA] Service worker state:', nw.state);
          
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[PWA] New version available. Reload to update.');
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA] Controller changed, reloading...');
        // Uncomment to auto-reload:
        // window.location.reload();
      });
    }).catch((err) => {
      console.error('[PWA] SW registration failed:', err);
    });
  });
}

export function promptUserToReload(reg) {
  if (reg.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}