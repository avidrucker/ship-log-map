import swLogger from './utils/swLogger';

export function registerSW() {
  if (!('serviceWorker' in navigator)) {
    swLogger.warn('registration', 'Service Worker not supported in this browser');
    return;
  }

  // ✅ Skip in dev (unless you want to test)
  if (import.meta.env.DEV) {
    swLogger.info('registration', 'Skipping SW registration in dev mode');
    return;
  }

  const swUrl = `${import.meta.env.BASE_URL}service-worker.js`;
  swLogger.info('registration', `Starting SW registration: ${swUrl}`);

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl).then((reg) => {
      swLogger.success('registration', `Service worker registered successfully`, { scope: reg.scope });
      
      // Log initial state
      if (reg.active) {
        swLogger.info('registration', 'Service worker is active', { state: reg.active.state });
      }
      if (reg.waiting) {
        swLogger.warn('registration', 'Service worker is waiting to activate');
      }
      if (reg.installing) {
        swLogger.info('registration', 'Service worker is installing');
      }
      
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        
        swLogger.info('registration', 'New service worker detected, installing...');
        
        nw.addEventListener('statechange', () => {
          swLogger.info('registration', `Service worker state changed: ${nw.state}`);
          
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            swLogger.success('registration', 'New version available. Reload to update.');
          }
          if (nw.state === 'activated') {
            swLogger.success('registration', 'New service worker activated');
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        swLogger.info('registration', 'Controller changed, app will reload');
        // Uncomment to auto-reload:
        // window.location.reload();
      });
    }).catch((err) => {
      swLogger.error('registration', 'SW registration failed', { error: err.message, stack: err.stack });
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