/**
 * Socket Store (Backward Compatibility Layer)
 * 
 * This file provides backward compatibility with the original socket.js implementation.
 * It re-exports all the stores and functions from the new modular structure.
 * 
 * For new code, it's recommended to import directly from the specific modules:
 * - import { regions, currentRegion } from '$lib/stores';
 * - import { transportService } from '$lib/services/transportService';
 */

// Re-export all stores
export {
  regions,
  playbackState,
  statusMessage,
  autoplayEnabled,
  countInEnabled,
  connectionStatus,
  currentRegion,
  markers,
  sortedMarkers
} from './index';

// Import the transport service
import { transportService } from '../services/transportService';
import socketService from '../services/socketService';

// Re-export the socket control interface for backward compatibility
export const socketControl = {
  // Transport controls
  togglePlay: transportService.togglePlay,
  seekToPosition: transportService.seekToPosition,
  seekToRegion: transportService.seekToRegion,
  nextRegion: transportService.nextRegion,
  previousRegion: transportService.previousRegion,
  seekToCurrentRegionStart: transportService.seekToCurrentRegionStart,
  refreshRegions: transportService.refreshRegions,
  refreshMarkers: () => socketService.emit('refreshMarkers'),
  toggleAutoplay: transportService.toggleAutoplay,
  toggleCountIn: transportService.toggleCountIn,
  disconnect: transportService.disconnect,
  
  // Project functions
  refreshProjectId: socketService.refreshProjectId,
  
  // Testing function
  testReconnection: socketService.testReconnection
};