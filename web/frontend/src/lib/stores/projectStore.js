/**
 * Project Store
 * Manages project identification and metadata
 */

import { writable } from 'svelte/store';
import { createInfoMessage } from './statusStore';

// Create a store for the project ID
export const projectId = writable(null);

/**
 * Update the project ID
 * @param {string} id - The project ID
 */
export function updateProjectId(id) {
  projectId.set(id);
  console.log('Project ID updated:', id);
}

/**
 * Get the current project ID
 * @returns {string|null} The project ID or null if not set
 */
export function getProjectId() {
  let result = null;
  
  // Get the current project ID
  const unsubscribe = projectId.subscribe(value => {
    result = value;
  });
  
  // Clean up subscription
  unsubscribe();
  
  return result;
}

// Export all functions
export default {
  projectId,
  updateProjectId,
  getProjectId
};