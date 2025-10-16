// src/utils/swLogger.js

/**
 * Service Worker Logger
 * Persists SW logs to localStorage so they can be viewed in Debug Modal
 * Especially useful for debugging mobile offline issues
 */

const MAX_LOGS = 200; // Keep last 200 log entries
const STORAGE_KEY = 'sw-logs';

/**
 * Log entry structure
 * @typedef {Object} LogEntry
 * @property {string} timestamp - ISO timestamp
 * @property {string} type - 'info' | 'warn' | 'error' | 'success'
 * @property {string} category - 'registration' | 'install' | 'activate' | 'fetch' | 'cache'
 * @property {string} message - Log message
 * @property {any} [data] - Optional additional data
 */

class SWLogger {
  constructor() {
    this.logs = this.loadLogs();
    this.setupBroadcastListener();
  }

  setupBroadcastListener() {
    // Listen for logs from service worker
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('sw-logs');
        channel.onmessage = (event) => {
          const entry = event.data;
          if (entry && entry.timestamp && entry.type && entry.category && entry.message) {
            this.logs.push(entry);
            this.saveLogs();
            
            // Also log to console
            const consoleMsg = `[SW ${entry.category}] ${entry.message}`;
            switch (entry.type) {
              case 'error':
                console.error(consoleMsg, entry.data || '');
                break;
              case 'warn':
                console.warn(consoleMsg, entry.data || '');
                break;
              case 'success':
                console.log(`✅ ${consoleMsg}`, entry.data || '');
                break;
              default:
                console.log(consoleMsg, entry.data || '');
            }
          }
        };
      } catch (err) {
        console.warn('[SWLogger] Failed to setup broadcast channel:', err);
      }
    }
  }

  loadLogs() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (err) {
      console.warn('[SWLogger] Failed to load logs:', err);
    }
    return [];
  }

  saveLogs() {
    try {
      // Keep only last MAX_LOGS entries
      const logsToSave = this.logs.slice(-MAX_LOGS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logsToSave));
    } catch (err) {
      console.warn('[SWLogger] Failed to save logs:', err);
    }
  }

  log(type, category, message, data = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      category,
      message,
      ...(data && { data })
    };

    this.logs.push(entry);
    this.saveLogs();

    // Also log to console with appropriate method
    const consoleMsg = `[SW ${category}] ${message}`;
    switch (type) {
      case 'error':
        console.error(consoleMsg, data || '');
        break;
      case 'warn':
        console.warn(consoleMsg, data || '');
        break;
      case 'success':
        console.log(`✅ ${consoleMsg}`, data || '');
        break;
      default:
        console.log(consoleMsg, data || '');
    }
  }

  info(category, message, data = null) {
    this.log('info', category, message, data);
  }

  warn(category, message, data = null) {
    this.log('warn', category, message, data);
  }

  error(category, message, data = null) {
    this.log('error', category, message, data);
  }

  success(category, message, data = null) {
    this.log('success', category, message, data);
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('[SWLogger] Failed to clear logs:', err);
    }
  }

  getStats() {
    const stats = {
      total: this.logs.length,
      errors: 0,
      warnings: 0,
      cacheHits: 0,
      cacheMisses: 0,
      networkRequests: 0
    };

    this.logs.forEach(log => {
      if (log.type === 'error') stats.errors++;
      if (log.type === 'warn') stats.warnings++;
      if (log.message.includes('Cache hit')) stats.cacheHits++;
      if (log.message.includes('Cache miss')) stats.cacheMisses++;
      if (log.message.includes('Network')) stats.networkRequests++;
    });

    return stats;
  }
}

// Singleton instance
const swLogger = new SWLogger();

export default swLogger;
