/**
 * Status Store
 * Manages status messages and notifications
 */

import { writable, type Writable } from 'svelte/store';
import { TIMEOUTS } from '../lib/config/ipcConfig';
import logger from '../lib/utils/logger';

/**
 * Interface for status message
 */
export interface StatusMessage {
  type: 'info' | 'warning' | 'error';
  message: string;
  details?: string | null;
  timestamp?: number;
}

/**
 * Store for status messages
 */
export const statusMessage: Writable<StatusMessage | null> = writable(null);

/**
 * Sets a status message
 * @param message - The status message object
 * @param autoClearMs - Optional auto-clear timeout in milliseconds
 */
export function setStatusMessage(message: StatusMessage | null, autoClearMs: number | null = null): void {
  if (!message) {
    statusMessage.set(null);
    return;
  }

  logger.log('Setting status message:', message);

  // Add timestamp if not provided
  if (!message.timestamp) {
    message = {
      ...message,
      timestamp: Date.now()
    };
  }

  statusMessage.set(message);

  // Auto-clear the message after the specified time or based on message type
  if (autoClearMs) {
    setTimeout(() => clearStatusMessage(message!), autoClearMs);
  } else if (message.type === 'warning') {
    setTimeout(() => clearStatusMessage(message!), TIMEOUTS.warningClear);
  } else if (message.type === 'info') {
    setTimeout(() => clearStatusMessage(message!), TIMEOUTS.statusClear);
  }
}

/**
 * Clears a specific status message if it matches the current one
 * @param message - The message to clear
 */
export function clearStatusMessage(message: StatusMessage): void {
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
export function clearAllStatusMessages(): void {
  statusMessage.set(null);
}

/**
 * Creates an error status message
 * @param message - The error message
 * @param details - Optional error details
 * @returns The formatted error message object
 */
export function createErrorMessage(message: string, details: string | null = null): StatusMessage {
  return {
    type: 'error',
    message,
    details: details || 'An error occurred',
    timestamp: Date.now()
  };
}

/**
 * Creates a warning status message
 * @param message - The warning message
 * @param details - Optional warning details
 * @returns The formatted warning message object
 */
export function createWarningMessage(message: string, details: string | null = null): StatusMessage {
  return {
    type: 'warning',
    message,
    details: details || null,
    timestamp: Date.now()
  };
}

/**
 * Creates an info status message
 * @param message - The info message
 * @param details - Optional info details
 * @returns The formatted info message object
 */
export function createInfoMessage(message: string, details: string | null = null): StatusMessage {
  return {
    type: 'info',
    message,
    details: details || null,
    timestamp: Date.now()
  };
}
