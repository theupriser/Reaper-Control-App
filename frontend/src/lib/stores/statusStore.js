/**
 * Status Store
 * Manages status messages and notifications
 */

import { writable } from 'svelte/store';
import { TIMEOUTS } from '../config/socketConfig';

/**
 * Store for status messages
 */
export const statusMessage = writable(null);

/**
 * Sets a status message
 * @param {Object} message - The status message object
 * @param {string} message.type - The type of message (info, warning, error)
 * @param {string} message.message - The message text
 * @param {string} [message.details] - Optional details about the message
 * @param {number} [autoClearMs] - Optional auto-clear timeout in milliseconds
 */
export function setStatusMessage(message, autoClearMs = null) {
  if (!message) {
    statusMessage.set(null);
    return;
  }
  
  console.log('Setting status message:', message);
  statusMessage.set(message);
  
  // Auto-clear the message after the specified time or based on message type
  if (autoClearMs) {
    setTimeout(() => clearStatusMessage(message), autoClearMs);
  } else if (message.type === 'warning') {
    setTimeout(() => clearStatusMessage(message), TIMEOUTS.warningClear);
  } else if (message.type === 'info') {
    setTimeout(() => clearStatusMessage(message), TIMEOUTS.statusClear);
  }
}

/**
 * Clears a specific status message if it matches the current one
 * @param {Object} message - The message to clear
 */
export function clearStatusMessage(message) {
  statusMessage.update(current => {
    // Only clear if it's the same message (to avoid clearing newer messages)
    if (current && current.message === message.message) {
      return null;
    }
    return current;
  });
}

/**
 * Clears all status messages
 */
export function clearAllStatusMessages() {
  statusMessage.set(null);
}

/**
 * Creates an error status message
 * @param {string} message - The error message
 * @param {string} [details] - Optional error details
 * @returns {Object} - The formatted error message object
 */
export function createErrorMessage(message, details = null) {
  return {
    type: 'error',
    message,
    details: details || 'An error occurred'
  };
}

/**
 * Creates a warning status message
 * @param {string} message - The warning message
 * @param {string} [details] - Optional warning details
 * @returns {Object} - The formatted warning message object
 */
export function createWarningMessage(message, details = null) {
  return {
    type: 'warning',
    message,
    details: details || null
  };
}

/**
 * Creates an info status message
 * @param {string} message - The info message
 * @param {string} [details] - Optional info details
 * @returns {Object} - The formatted info message object
 */
export function createInfoMessage(message, details = null) {
  return {
    type: 'info',
    message,
    details: details || null
  };
}