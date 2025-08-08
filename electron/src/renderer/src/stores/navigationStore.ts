/**
 * Navigation Store
 * Manages the current view/page in the application
 */

import { writable, type Writable } from 'svelte/store';
import logger from '../lib/utils/logger';

/**
 * Available views in the application
 */
export enum View {
  MAIN = 'main',
  PERFORMER = 'performer',
  SETLISTS = 'setlists'
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
  currentView.set(view);
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
