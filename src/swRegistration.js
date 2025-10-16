// src/swRegistration.js

import swLogger from './utils/swLogger';

// -- internal: safe postMessage to the active SW controller
function postToSW(msg) {
  const ctrl = navigator.serviceWorker.controller;
  if (ctrl) {
    ctrl.postMessage(msg);
    return true;
  }
  return false;
}

export async function registerSW() {
  if (!('serviceWorker' in navigator)) {
    swLogger.warn('registration', 'Service Worker not supported in this browser');
    return;
  }

  // Skip in dev unless you explicitly want to test SW locally
  if (import.meta.env.DEV) {
    swLogger.info('registration', 'Skipping SW registration in dev mode');
    return;
  }

  const swUrl = `${import.meta.env.BASE_URL}service-worker.js`;
  const scope = import.meta.env.BASE_URL; // e.g., '/ship-log-map/'
  swLogger.info('registration', `Registering SW: ${swUrl}`, { scope });

  try {
    // Register immediately (don’t wait for window 'load'—more robust on mobile)
    const reg = await navigator.serviceWorker.register(swUrl, {
      scope,
      updateViaCache: 'none',     // ensure we fetch the latest file, not HTTP cache
    });

    swLogger.success('registration', 'Service worker registered', { scope: reg.scope });

    // Log initial state
    if (reg.active)    swLogger.info('registration', 'SW active',    { state: reg.active.state });
    if (reg.waiting)   swLogger.warn('registration',  'SW waiting to activate');
    if (reg.installing) swLogger.info('registration', 'SW installing');

    // Watch for updates
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      swLogger.info('registration', 'New SW detected; installing...');
      nw.addEventListener('statechange', () => {
        swLogger.info('registration', `SW state: ${nw.state}`);
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          swLogger.success('registration', 'New version available. Reload to update.');
        }
        if (nw.state === 'activated') {
          swLogger.success('registration', 'New service worker activated');
        }
      });
    });

    // When the page becomes visible, ask the browser to check for updates
    // (nice for mobile where background updates can lag)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        reg.update().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);

    // If the controller changes (new SW took control), you can auto-reload if desired
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      swLogger.info('registration', 'Controller changed');
      // Optional auto-reload:
      // window.location.reload();
    });

    // Wait until the SW is ready/controlling this page, then send a ping + status dump
    // and (optionally) your image list so it’s cached for offline use on mobile.
    const readyReg = await navigator.serviceWorker.ready;

    // On first visit the controller might still be null until activate+claim completes.
    // Retry posting after controllerchange if needed.
    if (!postToSW({ type: 'PING' })) {
      const once = () => {
        navigator.serviceWorker.removeEventListener('controllerchange', once);
        postToSW({ type: 'PING' });
        postToSW({ type: 'GET_STATUS' });
      };
      navigator.serviceWorker.addEventListener('controllerchange', once);
    } else {
      postToSW({ type: 'GET_STATUS' });
    }

    swLogger.info('registration', 'SW ready', { scope: readyReg.scope });
    return reg;
  } catch (err) {
    swLogger.error('registration', 'SW registration failed', { error: err.message, stack: err.stack });
  }
}

// Call this from your app once you’ve built the list of image URLs you want offline.
// Example usage:
//   cacheGraphImages(imageUrlsArray)
export function cacheGraphImages(urls) {
  if (!('serviceWorker' in navigator)) return;
  if (!Array.isArray(urls) || urls.length === 0) return;

  // Try immediately; if no controller yet, wait until ready/controlled.
  if (!postToSW({ type: 'CACHE_IMAGES', urls })) {
    navigator.serviceWorker.ready.then(() => {
      // May still need to wait for controllerchange on very first load:
      if (!postToSW({ type: 'CACHE_IMAGES', urls })) {
        const once = () => {
          navigator.serviceWorker.removeEventListener('controllerchange', once);
          postToSW({ type: 'CACHE_IMAGES', urls });
        };
        navigator.serviceWorker.addEventListener('controllerchange', once);
      }
    });
  }
}

// Optional helper if you show an "Update available" UI somewhere
export function promptUserToReload(reg) {
  if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
