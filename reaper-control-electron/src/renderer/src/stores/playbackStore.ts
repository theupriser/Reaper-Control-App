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

    // Ensure required fields are present
    if (data.isPlaying === undefined || data.currentPosition === undefined) {
      logger.error('Received playback state is missing required fields:', data);
      return false;
    }

    // Update the playback state store
    playbackState.set({
      isPlaying: Boolean(data.isPlaying),
      currentPosition: Number(data.currentPosition) || 0,
      currentRegionId: data.currentRegionId !== undefined ? Number(data.currentRegionId) : null,
      selectedSetlistId: data.selectedSetlistId || null,
      bpm: data.bpm !== undefined ? Number(data.bpm) : 120, // Use received BPM or default to 120
      timeSignature: data.timeSignature || { numerator: 4, denominator: 4 } // Use received time signature or default to 4/4
    });

    // Update the autoplayEnabled store if the value is present in the data
    if (data.autoplayEnabled !== undefined) {
      autoplayEnabled.set(Boolean(data.autoplayEnabled));
    }

    // Update the countInEnabled store if the value is present in the data
    if (data.countInEnabled !== undefined) {
      countInEnabled.set(Boolean(data.countInEnabled));
    }

    // Log success
    logger.log('Successfully updated playback state:', {
      isPlaying: Boolean(data.isPlaying),
      currentPosition: Number(data.currentPosition) || 0,
      currentRegionId: data.currentRegionId !== undefined ? Number(data.currentRegionId) : null,
      selectedSetlistId: data.selectedSetlistId || null,
      bpm: data.bpm !== undefined ? Number(data.bpm) : 120,
      timeSignature: data.timeSignature || { numerator: 4, denominator: 4 },
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
