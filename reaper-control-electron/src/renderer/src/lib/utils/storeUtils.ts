/**
 * Store Utilities
 * Helper functions for working with Svelte stores
 */
import type { Writable } from 'svelte/store';

/**
 * Gets the current value from a store
 * @param store - The Svelte store
 * @returns The current value of the store
 */
export function getStoreValue<T>(store: Writable<T>): T {
  let value: T;
  const unsubscribe = store.subscribe(storeValue => {
    value = storeValue;
  });
  unsubscribe();
  return value!;
}

/**
 * Updates a specific property in a store
 * @param store - The Svelte store
 * @param property - The property to update
 * @param value - The new value
 */
export function updateStoreProperty<T extends Record<string, any>>(
  store: Writable<T>,
  property: keyof T,
  value: any
): void {
  store.update(current => ({
    ...current,
    [property]: value
  }));
}

/**
 * Updates multiple properties in a store
 * @param store - The Svelte store
 * @param properties - Object with properties to update
 */
export function updateStoreProperties<T extends Record<string, any>>(
  store: Writable<T>,
  properties: Partial<T>
): void {
  store.update(current => ({
    ...current,
    ...properties
  }));
}

/**
 * Creates a derived value from a store without creating a new store
 * @param store - The Svelte store
 * @param deriveFn - Function to derive the value
 * @returns The derived value
 */
export function deriveValue<T, R>(
  store: Writable<T>,
  deriveFn: (value: T) => R
): R {
  let value: R;
  const unsubscribe = store.subscribe(storeValue => {
    value = deriveFn(storeValue);
  });
  unsubscribe();
  return value!;
}

/**
 * Safely updates a store with validation
 * @param store - The Svelte store
 * @param newValue - The new value
 * @param validateFn - Validation function that returns true if valid
 * @returns True if the update was successful
 */
export function safeUpdateStore<T>(
  store: Writable<T>,
  newValue: T,
  validateFn?: (value: T) => boolean
): boolean {
  try {
    if (validateFn && !validateFn(newValue)) {
      console.warn('Invalid value for store update:', newValue);
      return false;
    }

    store.set(newValue);
    return true;
  } catch (error) {
    console.error('Error updating store:', error);
    return false;
  }
}

/**
 * Formats a time value in seconds to MM:SS format
 * @param seconds - Time in seconds
 * @returns Formatted time string
 */
export function formatTime(seconds: number | undefined | null): string {
  if (seconds === undefined || seconds === null) return '--:--';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
