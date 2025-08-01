/**
 * Store Index
 * Re-exports all stores for easier importing
 */

// Re-export from region store
export { 
  regions, 
  currentRegion,
  updateRegions,
  findRegionById,
  getNextRegion,
  getPreviousRegion
} from './regionStore';

// Re-export from playback store
export {
  playbackState,
  autoplayEnabled,
  updatePlaybackState,
  updatePartialPlaybackState,
  getPlaybackState,
  getAutoplayEnabled,
  toggleAutoplay
} from './playbackStore';

// Re-export from status store
export {
  statusMessage,
  setStatusMessage,
  clearStatusMessage,
  clearAllStatusMessages,
  createErrorMessage,
  createWarningMessage,
  createInfoMessage
} from './statusStore';

// Re-export from connection store
export {
  connectionStatus,
  updateConnectionStatus,
  setConnected,
  setDisconnected,
  setReconnecting,
  setReconnected,
  setConnectionError,
  updatePingInfo,
  getConnectionStatus,
  isConnected
} from './connectionStore';