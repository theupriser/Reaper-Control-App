/**
 * Connection Store
 * Manages the state of the IPC connection
 */

import { writable, type Writable } from 'svelte/store';

/**
 * Interface for connection status
 */
export interface ConnectionStatus {
  connected: boolean;
  lastPing: Date | null;
  pingLatency: number | null;
  reconnecting: boolean;
  reconnectAttempt: number;
  lastError: string | null;
}

/**
 * Store for connection status
 */
export const connectionStatus: Writable<ConnectionStatus> = writable({
  connected: false,
  lastPing: null,
  pingLatency: null,
  reconnecting: false,
  reconnectAttempt: 0,
  lastError: null
});

/**
 * Updates the connection status
 * @param status - Partial connection status object
 */
export function updateConnectionStatus(status: Partial<ConnectionStatus>): void {
  connectionStatus.update(current => ({
    ...current,
    ...status
  }));
}

/**
 * Sets the connection as connected
 */
export function setConnected(): void {
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
export function setDisconnected(): void {
  connectionStatus.update(status => ({
    ...status,
    connected: false
  }));
}

/**
 * Updates the connection status for a reconnection attempt
 * @param attemptNumber - The reconnection attempt number
 */
export function setReconnecting(attemptNumber: number): void {
  connectionStatus.update(status => ({
    ...status,
    reconnecting: true,
    reconnectAttempt: attemptNumber
  }));
}

/**
 * Updates the connection status after a successful reconnection
 */
export function setReconnected(): void {
  connectionStatus.update(status => ({
    ...status,
    connected: true,
    reconnecting: false,
    reconnectAttempt: 0
  }));
}

/**
 * Updates the connection status with an error
 * @param error - The error message
 */
export function setConnectionError(error: string): void {
  connectionStatus.update(status => ({
    ...status,
    lastError: error
  }));
}

/**
 * Updates the ping information
 * @param latency - The ping latency in milliseconds
 */
export function updatePingInfo(latency: number): void {
  connectionStatus.update(status => ({
    ...status,
    lastPing: new Date(),
    pingLatency: latency
  }));
}

/**
 * Gets the current connection status
 * @returns The current connection status
 */
export function getConnectionStatus(): ConnectionStatus {
  let status: ConnectionStatus;
  const unsubscribe = connectionStatus.subscribe(value => {
    status = value;
  });
  unsubscribe();
  return status!;
}

/**
 * Checks if the IPC is currently connected
 * @returns True if connected
 */
export function isConnected(): boolean {
  let connected = false;
  const unsubscribe = connectionStatus.subscribe(status => {
    connected = status.connected;
  });
  unsubscribe();
  return connected;
}
