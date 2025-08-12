/**
 * Store Index
 * Re-exports all stores for easier importing
 */

// Import time formatting functions from timeUtils
import { formatTime, formatLongTime } from '../lib/utils/timeUtils';

// Re-export time formatting functions
export { formatTime, formatLongTime };

// Re-export from transport service
export {
  nextRegionHandler,
  previousRegionHandler,
  togglePlay,
  safeTransportAction,
  toggleAutoplayHandler,
  toggleCountInHandler,
  handleProgressBarClick,
  updateTimer,
  updateTimerOnRegionChange,
  transportButtonsDisabled,
  localPosition,
  useLocalTimer,
  atHardStop
} from '../services/transportService';

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
  isConnected,
  type ConnectionStatus
} from './connectionStore';

// Re-export from MIDI store
export {
  midiActivity,
  setMidiActive,
  getMidiActivity,
  type MidiActivityStatus
} from './midiStore';

// Re-export from project store
export {
  projectId,
  updateProjectId,
  getProjectId
} from './projectStore';

// Re-export from status store
export {
  statusMessage,
  setStatusMessage,
  clearStatusMessage,
  clearAllStatusMessages,
  createErrorMessage,
  createWarningMessage,
  createInfoMessage,
  type StatusMessage
} from './statusStore';

// Re-export from region store
export {
  regions,
  currentRegion,
  updateRegions,
  findRegionById,
  getNextRegion,
  getPreviousRegion,
  nextRegion,
  previousRegion,
  type Region
} from './regionStore';

// Re-export from playback store
export {
  playbackState,
  autoplayEnabled,
  countInEnabled,
  recordingArmed,
  updatePlaybackState,
  updatePartialPlaybackState,
  getPlaybackState,
  getAutoplayEnabled,
  toggleAutoplay,
  getCountInEnabled,
  toggleCountIn,
  type PlaybackState,
  type TimeSignature
} from './playbackStore';

// Re-export from marker store
export {
  markers,
  sortedMarkers,
  refreshMarkers,
  findMarkerById,
  updateMarkers,
  getCustomLengthForRegion,
  getEffectiveRegionLength,
  has1008MarkerInRegion,
  getBpmForRegion,
  type Marker
} from './markerStore';
