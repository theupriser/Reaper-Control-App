import { socketControl } from '$lib/stores/socket';
import { projectId } from '$lib/stores';
// Direct import of socketService to ensure it's initialized
import socketService from '$lib/services/socketService';

export function load() {
  return {
    projectId
  };
}

// Function to initialize the app
export function _initializeApp() {
  // Ensure socket is connected before refreshing project ID
  if (socketService.isConnected()) {
    socketControl.refreshProjectId();
  } else {
    console.log('Socket not connected, initializing connection...');
    // Add a small delay to allow socket connection to establish
    setTimeout(() => {
      socketControl.refreshProjectId();
    }, 500);
  }
}