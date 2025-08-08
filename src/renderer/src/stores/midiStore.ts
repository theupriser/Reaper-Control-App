/**
 * MIDI Store
 * Manages the state of MIDI activity
 */

import { writable, type Writable } from 'svelte/store';

/**
 * Interface for MIDI activity status
 */
export interface MidiActivityStatus {
  active: boolean;
  lastReceived: Date | null;
}

/**
 * Store for MIDI activity status
 */
export const midiActivity: Writable<MidiActivityStatus> = writable({
  active: false,
  lastReceived: null
});

/**
 * Sets MIDI activity to active and starts a timer to deactivate after 100ms
 */
export function setMidiActive(): void {
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
 * @returns The current MIDI activity status
 */
export function getMidiActivity(): MidiActivityStatus {
  let status: MidiActivityStatus;
  const unsubscribe = midiActivity.subscribe(value => {
    status = value;
  });
  unsubscribe();
  return status!;
}
