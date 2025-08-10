/**
 * Navigation Store
 * Manages the current view/page in the application
 */

import { writable, type Writable, get } from 'svelte/store';
import logger from '../lib/utils/logger';
import { currentSetlist } from './setlistStore';
import { setSelectedSetlist } from './playbackStore';
import { cleanupRegionAndPlaybackListeners, setupRegionAndPlaybackListeners } from '../services/ipcService';

/**
 * Available views in the application
 */
export enum View {
  MAIN = 'main',
  PERFORMER = 'performer',
  SETLISTS = 'setlists',
  HELP = 'help',
  SETTINGS = 'settings'
}

/**
 * Store for the current view
 */
export const currentView: Writable<View> = writable(View.MAIN);

/**
 * Navigate to a specific view
 * @param view - The view to navigate to
 */
export function navigateTo(view: View): void {
  logger.log(`Navigating to view: ${view}`);

  // Get the current view before changing it
  const prevView = get(currentView);

  // Clean up region and playback event listeners to prevent duplicate listeners
  cleanupRegionAndPlaybackListeners();
  logger.debug('Cleaned up region and playback listeners before navigation');

  // When entering setlist editor, drop the selectedSetlistId
  if (view === View.SETLISTS) {
    logger.log('Entering setlist editor, clearing selectedSetlistId');
    setSelectedSetlist(null);
  }
  // When leaving setlist editor to another view
  else if (prevView === View.SETLISTS) {
    // When navigating from setlist editor to player, sync the selected setlist
    if (view === View.MAIN) {
      const currentEditedSetlist = get(currentSetlist);

      // If there was a setlist being edited, set it as the selected setlist
      if (currentEditedSetlist) {
        logger.log(`Setting selected setlist to last edited: ${currentEditedSetlist.name} (${currentEditedSetlist.id})`);
        setSelectedSetlist(currentEditedSetlist.id);
      }
    }
    // When navigating from setlist editor to any view other than player or performer, clear selectedSetlistId
    else if (view !== View.PERFORMER) {
      logger.log('Leaving setlist editor to view other than player or performer, clearing selectedSetlistId');
      setSelectedSetlist(null);
    }
  }

  // For transitions between player and performer modes, preserve the selectedSetlistId
  // (no action needed as the selectedSetlistId is not modified)

  // Update the current view
  currentView.set(view);

  // Re-initialize region and playback event listeners
  setupRegionAndPlaybackListeners();
  logger.debug('Re-initialized region and playback listeners after navigation');
}

/**
 * Get the current view
 * @returns The current view
 */
export function getCurrentView(): View {
  let view: View;
  const unsubscribe = currentView.subscribe(value => {
    view = value;
  });
  unsubscribe();
  return view!;
}

/**
 * Check if the current view is the specified view
 * @param view - The view to check
 * @returns True if the current view is the specified view
 */
export function isCurrentView(view: View): boolean {
  return getCurrentView() === view;
}

export default {
  currentView,
  navigateTo,
  getCurrentView,
  isCurrentView,
  View
};
