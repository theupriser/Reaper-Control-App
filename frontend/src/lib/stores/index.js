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
  getPreviousRegion,
  nextRegion
} from './regionStore';

// Re-export from playback store
export {
  playbackState,
  autoplayEnabled,
  countInEnabled,
  updatePlaybackState,
  updatePartialPlaybackState,
  getPlaybackState,
  getAutoplayEnabled,
  toggleAutoplay,
  getCountInEnabled,
  toggleCountIn
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

// Re-export from project store
export {
  projectId,
  updateProjectId,
  getProjectId
} from './projectStore';

// Re-export from setlist store
export {
  setlists,
  currentSetlist,
  loading as setlistLoading,
  error as setlistError,
  currentSetlistWithRegions,
  fetchSetlists,
  fetchSetlist,
  createSetlist,
  updateSetlist,
  deleteSetlist,
  addSetlistItem,
  removeSetlistItem,
  moveSetlistItem,
  clearError as clearSetlistError,
  resetSetlistStore
} from './setlistStore';

// Re-export from marker store
export {
  markers,
  sortedMarkers,
  refreshMarkers,
  findMarkerById,
  updateMarkers,
  getCustomLengthForRegion
} from './markerStore';