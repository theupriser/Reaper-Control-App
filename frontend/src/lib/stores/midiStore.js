/**
 * MIDI Store
 * Manages the state of MIDI activity
 */

import { writable } from 'svelte/store';

/**
 * Store for MIDI activity status
 */
export const midiActivity = writable({
  active: false,
  lastReceived: null
});

/**
 * Sets MIDI activity to active and starts a timer to deactivate after 100ms
 */
export function setMidiActive() {
  midiActivity.update(current => ({
    ...current,
    active: true,
    lastReceived: new Date()
  }));
  
  // Automatically turn off the indicator after 100ms
  setTimeout(() => {
    midiActivity.update(current => ({
      ...current,
      active: false
    }));
  }, 100);
}

/**
 * Gets the current MIDI activity status
 * @returns {Object} - The current MIDI activity status
 */
export function getMidiActivity() {
  let status;
  const unsubscribe = midiActivity.subscribe(value => {
    status = value;
  });
  unsubscribe();
  return status;
}