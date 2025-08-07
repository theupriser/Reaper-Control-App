/**
 * Playback Store
 * Manages the state of playback including play/pause status, position, and current region
 */

import { writable, type Writable } from 'svelte/store';
import logger from '../lib/utils/logger';

/**
 * Interface for time signature
 */
export interface TimeSignature {
  numerator: number;
  denominator: number;
}

/**
 * Interface for playback state
 */
export interface PlaybackState {
  isPlaying: boolean;
  currentPosition: number;
  currentRegionId: number | null;
  selectedSetlistId: string | null;
  bpm: number;
  timeSignature: TimeSignature;
}

/**
 * Store for playback state
 */
export const playbackState: Writable<PlaybackState> = writable({
  isPlaying: false,
  currentPosition: 0,
  currentRegionId: null,
  selectedSetlistId: null,
  bpm: 120, // Default BPM value
  timeSignature: {
    numerator: 4,
    denominator: 4
  } // Default time signature (4/4)
});

/**
 * Store for autoplay toggle
 */
export const autoplayEnabled: Writable<boolean> = writable(true);

/**
 * Store for count-in toggle
 */
export const countInEnabled: Writable<boolean> = writable(false);

/**
 * Updates the playback state with new data
 * @param data - Playback state data
 * @returns True if update was successful
 */
export function updatePlaybackState(data: Partial<PlaybackState>): boolean {
  try {
    // Validate the data
    if (!data) {
      logger.warn('No playback state received');
      return false;
    }

    // Check for missing required fields and log them
    const missingFields = [];
    if (data.isPlaying === undefined) missingFields.push('isPlaying');
    if (data.currentPosition === undefined) missingFields.push('currentPosition');

    if (missingFields.length > 0) {
      logger.warn(`Playback state missing fields: ${missingFields.join(', ')}. Using defaults.`, data);
      // Continue with defaults rather than failing
    }

    // Get current state to use as fallback for missing fields
    let currentState: PlaybackState;
    const unsubscribe = playbackState.subscribe(value => {
      currentState = value;
    });
    unsubscribe();

    // Prepare the new state with robust defaults
    const newState = {
      // For boolean values, use explicit Boolean conversion with fallbacks
      isPlaying: data.isPlaying !== undefined ? Boolean(data.isPlaying) : currentState.isPlaying,

      // For numeric values, handle NaN and other edge cases
      currentPosition: data.currentPosition !== undefined ?
        (isNaN(Number(data.currentPosition)) ? currentState.currentPosition : Number(data.currentPosition)) :
        currentState.currentPosition,

      // For currentRegionId, properly handle null vs undefined vs invalid
      currentRegionId: data.currentRegionId !== undefined ?
        (data.currentRegionId === null ? null :
          (isNaN(Number(data.currentRegionId)) ? currentState.currentRegionId : Number(data.currentRegionId))) :
        currentState.currentRegionId,

      // For selectedSetlistId, explicitly check for undefined to preserve null values
      selectedSetlistId: data.selectedSetlistId !== undefined ? data.selectedSetlistId : currentState.selectedSetlistId,

      // For bpm, ensure we handle NaN and other edge cases
      bpm: data.bpm !== undefined ?
        (isNaN(Number(data.bpm)) ? currentState.bpm : Number(data.bpm)) :
        currentState.bpm,

      // For timeSignature, validate it has required properties
      timeSignature: (data.timeSignature &&
        typeof data.timeSignature.numerator === 'number' &&
        typeof data.timeSignature.denominator === 'number') ?
        data.timeSignature : currentState.timeSignature
    };

    // Update the playback state store
    playbackState.set(newState);

    // Update the autoplayEnabled store if the value is present in the data
    if (data.autoplayEnabled !== undefined) {
      autoplayEnabled.set(Boolean(data.autoplayEnabled));
    }

    // Update the countInEnabled store if the value is present in the data
    if (data.countInEnabled !== undefined) {
      countInEnabled.set(Boolean(data.countInEnabled));
    }

    // Log success with the new state
    logger.log('Successfully updated playback state:', {
      ...newState,
      autoplayEnabled: data.autoplayEnabled !== undefined ? Boolean(data.autoplayEnabled) : undefined,
      countInEnabled: data.countInEnabled !== undefined ? Boolean(data.countInEnabled) : undefined
    });

    return true;
  } catch (error) {
    logger.error('Error processing playback state data:', error);
    return false;
  }
}

/**
 * Updates only specific fields of the playback state
 * @param partialState - Partial playback state data
 */
export function updatePartialPlaybackState(partialState: Partial<PlaybackState>): void {
  playbackState.update(state => ({
    ...state,
    ...partialState
  }));
}

/**
 * Gets the current playback state
 * @returns The current playback state
 */
export function getPlaybackState(): PlaybackState {
  let state: PlaybackState;
  const unsubscribe = playbackState.subscribe(value => {
    state = value;
  });
  unsubscribe();
  return state!;
}

/**
 * Gets the current autoplay setting
 * @returns The current autoplay setting
 */
export function getAutoplayEnabled(): boolean {
  let enabled: boolean;
  const unsubscribe = autoplayEnabled.subscribe(value => {
    enabled = value;
  });
  unsubscribe();
  return enabled!;
}

/**
 * Toggles the autoplay setting
 */
export function toggleAutoplay(): void {
  autoplayEnabled.update(current => !current);
}

/**
 * Gets the current count-in setting
 * @returns The current count-in setting
 */
export function getCountInEnabled(): boolean {
  let enabled: boolean;
  const unsubscribe = countInEnabled.subscribe(value => {
    enabled = value;
  });
  unsubscribe();
  return enabled!;
}

/**
 * Toggles the count-in setting
 */
export function toggleCountIn(): void {
  countInEnabled.update(current => !current);
}

/**
 * Sets the selected setlist ID
 * @param setlistId - Setlist ID or null for all regions
 */
export function setSelectedSetlist(setlistId: string | null): void {
  // Update the local store
  updatePartialPlaybackState({ selectedSetlistId: setlistId });

  // Log the change
  logger.log(`Setting selected setlist to: ${setlistId || 'null (all regions)'}`);

  // Use IPC to send to main process
  if (window.electronAPI) {
    window.electronAPI.setSelectedSetlist(setlistId);
    logger.log('Sent selected setlist to main process');
  } else {
    logger.warn('Electron API not available, selected setlist not sent to main process');
  }
}
