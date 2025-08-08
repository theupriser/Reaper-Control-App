import { writable } from 'svelte/store';
import { 
  playbackState, 
  currentSetlist, 
  fetchSetlist, 
  fetchSetlists,
  setlists
} from '$lib/stores';
import { socketControl } from '$lib/stores/socket';
import { setSelectedSetlist } from '$lib/stores/playbackStore';

// Create a writable store for the selected setlist ID
export const selectedSetlistId = writable("");

/**
 * Initialize setlist handling
 * - Optionally refreshes regions from Reaper
 * - Optionally fetches available setlists
 * - Sets up subscription to playbackState for setlist selection
 * @param {Object} options - Configuration options
 * @param {boolean} options.refreshRegions - Whether to refresh regions from Reaper
 * @param {boolean} options.fetchAllSetlists - Whether to fetch all available setlists
 * @returns {Function} Cleanup function to unsubscribe
 */
export function initializeSetlistHandling(options = { refreshRegions: true, fetchAllSetlists: true }) {
  // Optionally refresh regions
  if (options.refreshRegions) {
    socketControl.refreshRegions();
  }
  
  // Optionally fetch all setlists
  if (options.fetchAllSetlists) {
    fetchSetlists();
  }
  
  // Subscribe to playbackState to get the selectedSetlistId
  let previousSetlistId = null;
  const unsubscribe = playbackState.subscribe(state => {
    // Only update if the setlist ID has changed to avoid unnecessary refreshes during playback
    if (state.selectedSetlistId !== previousSetlistId) {
      console.log('Setlist ID changed, updating:', state.selectedSetlistId);
      
      // If there's a selected setlist in playbackState, load it
      selectedSetlistId.set(state.selectedSetlistId || "");
      
      if (state.selectedSetlistId) {
        fetchSetlist(state.selectedSetlistId);
      } else {
        currentSetlist.set(null);
      }
      
      // Update the previous ID to avoid future unnecessary updates
      previousSetlistId = state.selectedSetlistId;
    }
  });
  
  // Return a cleanup function
  return unsubscribe;
}

/**
 * Handle setlist selection
 * When a setlist is selected, fetch its details, pause Reaper, and select the first song
 * When "All Regions" is selected, clear the current setlist
 * Also store the selected setlist in Reaper extended data
 * @param {string} id - The selected setlist ID
 * @returns {Promise<Object|null>} The fetched setlist or null
 */
export async function handleSetlistChange(id) {
  if (id) {
    // Get current playback state
    let currentState;
    const unsubscribe = playbackState.subscribe(state => {
      currentState = state;
    });
    unsubscribe();

    // Only pause if currently playing
    if (currentState && currentState.isPlaying) {
      socketControl.togglePlay();
    }

    // Fetch the setlist and store the result
    const setlist = await fetchSetlist(id);
    
    // Store the selected setlist ID in Reaper extended data
    setSelectedSetlist(id);

    // Select the first song in the setlist if available
    if (setlist && setlist.items && setlist.items.length > 0) {
      const firstSong = setlist.items[0];
      socketControl.seekToRegion(firstSong.regionId);
    }
    
    return setlist;
  } else {
    // Clear current setlist to show all regions
    currentSetlist.set(null);
    // Store null in Reaper extended data to indicate all regions
    setSelectedSetlist(null);
    return null;
  }
}