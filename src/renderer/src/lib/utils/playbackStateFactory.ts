/**
 * Playback State Factory
 *
 * This module provides factory functions to create and update playback state objects
 * in a consistent way across the application. It serves as a single source of truth
 * for the default values and structure of playback states.
 */

import type { PlaybackState } from '../../../stores/playbackStore';

/**
 * Default playback state values
 */
export const DEFAULT_PLAYBACK_STATE: PlaybackState = {
  isPlaying: false,
  currentPosition: 0,
  currentRegionId: null,
  selectedSetlistId: null,
  bpm: 120,
  timeSignature: {
    numerator: 4,
    denominator: 4
  },
  autoplayEnabled: true,
  countInEnabled: false,
  isRecordingArmed: false
};

/**
 * Creates a new playback state with default values that can be overridden
 * @param overrides - Values to override defaults with
 * @returns New playback state
 */
export function createPlaybackState(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    ...DEFAULT_PLAYBACK_STATE,
    ...overrides
  };
}

/**
 * Updates an existing playback state with new values
 * @param currentState - Current playback state
 * @param updates - Updates to apply
 * @returns Updated playback state
 */
export function updatePlaybackState(
  currentState: PlaybackState,
  updates: Partial<PlaybackState>
): PlaybackState {
  return {
    ...currentState,
    ...updates
  };
}
