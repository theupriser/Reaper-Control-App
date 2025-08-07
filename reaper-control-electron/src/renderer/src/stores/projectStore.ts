/**
 * Project Store
 * Manages project identification and metadata
 */

import { writable, type Writable } from 'svelte/store';
import logger from '../lib/utils/logger';

// Create a store for the project ID
export const projectId: Writable<string | null> = writable(null);

/**
 * Update the project ID
 * @param id - The project ID
 */
export function updateProjectId(id: string): void {
  projectId.set(id);
  logger.log('Project ID updated:', id);
}

/**
 * Get the current project ID
 * @returns The project ID or null if not set
 */
export function getProjectId(): string | null {
  let result: string | null = null;

  // Get the current project ID
  const unsubscribe = projectId.subscribe(value => {
    result = value;
  });

  // Clean up subscription
  unsubscribe();

  return result;
}
