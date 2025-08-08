/**
 * Connection Store
 * Manages the state of the socket connection
 */

import { writable } from 'svelte/store';

/**
 * Store for connection status
 */
export const connectionStatus = writable({
  connected: false,
  lastPing: null,
  pingLatency: null,
  reconnecting: false,
  reconnectAttempt: 0,
  lastError: null
});

/**
 * Updates the connection status
 * @param {Object} status - Partial connection status object
 */
export function updateConnectionStatus(status) {
  connectionStatus.update(current => ({
    ...current,
    ...status
  }));
}

/**
 * Sets the connection as connected
 */
export function setConnected() {
  connectionStatus.set({
    connected: true,
    lastPing: null,
    pingLatency: null,
    reconnecting: false,
    reconnectAttempt: 0,
    lastError: null
  });
}

/**
 * Sets the connection as disconnected
 */
export function setDisconnected() {
  connectionStatus.update(status => ({
    ...status,
    connected: false
  }));
}

/**
 * Updates the connection status for a reconnection attempt
 * @param {number} attemptNumber - The reconnection attempt number
 */
export function setReconnecting(attemptNumber) {
  connectionStatus.update(status => ({
    ...status,
    reconnecting: true,
    reconnectAttempt: attemptNumber
  }));
}

/**
 * Updates the connection status after a successful reconnection
 */
export function setReconnected() {
  connectionStatus.update(status => ({
    ...status,
    connected: true,
    reconnecting: false,
    reconnectAttempt: 0
  }));
}

/**
 * Updates the connection status with an error
 * @param {string} error - The error message
 */
export function setConnectionError(error) {
  connectionStatus.update(status => ({
    ...status,
    lastError: error
  }));
}

/**
 * Updates the ping information
 * @param {number} latency - The ping latency in milliseconds
 */
export function updatePingInfo(latency) {
  connectionStatus.update(status => ({
    ...status,
    lastPing: new Date(),
    pingLatency: latency
  }));
}

/**
 * Gets the current connection status
 * @returns {Object} - The current connection status
 */
export function getConnectionStatus() {
  let status;
  const unsubscribe = connectionStatus.subscribe(value => {
    status = value;
  });
  unsubscribe();
  return status;
}

/**
 * Checks if the socket is currently connected
 * @returns {boolean} - True if connected
 */
export function isConnected() {
  let connected = false;
  const unsubscribe = connectionStatus.subscribe(status => {
    connected = status.connected;
  });
  unsubscribe();
  return connected;
}