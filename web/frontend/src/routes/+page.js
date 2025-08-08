import { 
  setlists, 
  setlistLoading 
} from '$lib/stores';
import { playbackState } from '$lib/stores/playbackStore';
import { 
  selectedSetlistId as _selectedSetlistId, 
  initializeSetlistHandling, 
  handleSetlistChange as _handleSetlistChange 
} from '$lib/services/setlistService';

// Re-export the imported functions for use in +page.svelte
export { _selectedSetlistId, _handleSetlistChange };

/**
 * Initialize the page data
 * - Refreshes regions from Reaper
 * - Fetches available setlists
 * - Sets up subscription to playbackState for setlist selection
 * @returns {Function} Cleanup function to unsubscribe
 */
export function _initializePage() {
  // Use the shared service to initialize setlist handling
  return initializeSetlistHandling({
    refreshRegions: true,
    fetchAllSetlists: true
  });
}