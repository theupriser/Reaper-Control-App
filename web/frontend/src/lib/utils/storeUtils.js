/**
 * Store Utilities
 * Helper functions for working with Svelte stores
 */

/**
 * Gets the current value from a store
 * @param {Object} store - The Svelte store
 * @returns {*} - The current value of the store
 */
export function getStoreValue(store) {
  let value;
  const unsubscribe = store.subscribe(storeValue => {
    value = storeValue;
  });
  unsubscribe();
  return value;
}

/**
 * Updates a specific property in a store
 * @param {Object} store - The Svelte store
 * @param {string} property - The property to update
 * @param {*} value - The new value
 */
export function updateStoreProperty(store, property, value) {
  store.update(current => ({
    ...current,
    [property]: value
  }));
}

/**
 * Updates multiple properties in a store
 * @param {Object} store - The Svelte store
 * @param {Object} properties - Object with properties to update
 */
export function updateStoreProperties(store, properties) {
  store.update(current => ({
    ...current,
    ...properties
  }));
}

/**
 * Creates a derived value from a store without creating a new store
 * @param {Object} store - The Svelte store
 * @param {Function} deriveFn - Function to derive the value
 * @returns {*} - The derived value
 */
export function deriveValue(store, deriveFn) {
  let value;
  const unsubscribe = store.subscribe(storeValue => {
    value = deriveFn(storeValue);
  });
  unsubscribe();
  return value;
}

/**
 * Safely updates a store with validation
 * @param {Object} store - The Svelte store
 * @param {*} newValue - The new value
 * @param {Function} validateFn - Validation function that returns true if valid
 * @returns {boolean} - True if the update was successful
 */
export function safeUpdateStore(store, newValue, validateFn) {
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
 * @param {number} seconds - Time in seconds
 * @returns {string} - Formatted time string
 */
export function formatTime(seconds) {
  if (!seconds && seconds !== 0) return '--:--';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}