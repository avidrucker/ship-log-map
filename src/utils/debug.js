// src/utils/debug.js

/**
 * Debug Logging Utilities
 *
 * Responsibilities
 * - Small wrapper around console with leveled helpers: printDebug/printWarn/
 *   printError that can be silenced or formatted consistently.
 *
 * Tips
 * - Prefer these over bare console.log so logs can be filtered in production.
 */

import { DEBUG_LOGGING } from "../config/features.js";

/**
 * Centralized debug logging utility
 * Only logs when DEBUG_LOGGING feature flag is enabled
 */
export const printDebug = (...args) => {
  if (DEBUG_LOGGING) {
    console.log(...args);
  }
};

/**
 * Debug logging with a specific prefix/category
 */
export const printDebugWithPrefix = (prefix, ...args) => {
  if (DEBUG_LOGGING) {
    console.log(`${prefix}`, ...args);
  }
};

/**
 * Always log errors regardless of debug flag
 */
export const printError = (...args) => {
  console.error(...args);
};

/**
 * Always log warnings regardless of debug flag
 */
export const printWarn = (...args) => {
  console.warn(...args);
};
