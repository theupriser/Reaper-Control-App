/**
 * Preload Script
 * This script runs in the renderer process before the web content is loaded.
 * It provides a secure bridge between the renderer process and the main process.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electronAPI', 
  {
    // Method to restart the backend server
    restartBackend: () => ipcRenderer.send('restart-backend'),
    
    // Method to report frontend connection status to the main process
    reportConnectionStatus: (status) => ipcRenderer.send('frontend-connection-status', status),
    
    // Flag to indicate that the app is running in Electron
    isElectron: true
  }
);

// Inject a global variable to indicate that we're running in Electron
// This will be used by the frontend to adjust its behavior
window.isElectronApp = true;