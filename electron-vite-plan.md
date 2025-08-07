# Electron-Vite Migration Plan

This document outlines the step-by-step plan to migrate the Reaper Control application to electron-vite while maintaining identical functionality and appearance, but using Electron's IPC instead of Socket.IO for communication. The application will be built with TypeScript, Svelte 5, and pnpm.

## Project Setup

- [x] Create a new electron-vite project
  ```bash
  pnpm create electron-vite@latest reaper-control-electron
  # Select Svelte and TypeScript as the template when prompted
  ```
- [x] Set up the project structure
  ```
  reaper-control-electron/
  ├── electron/          # Electron main process code
  │   ├── main.ts        # Main entry point
  │   ├── preload.ts     # Preload script for secure IPC
  │   └── backend/       # Backend functionality moved to main process
  ├── src/               # Renderer process (frontend) code
  │   ├── assets/        # Static assets
  │   └── components/    # Svelte components
  ├── index.html         # HTML entry point
  └── package.json       # Project configuration
  ```
- [x] Install required dependencies
  ```bash
  pnpm install electron electron-builder
  # No need for socket.io-client anymore
  ```

## Frontend Migration

- [x] Copy and convert Svelte components to TypeScript
  - [x] Copy all components from `/frontend/src/lib/components/` to `/src/components/`
  - [x] Convert JavaScript (.js/.svelte) files to TypeScript (.ts/.svelte with TypeScript)
  - [x] Update import paths in all components
  - [x] Update SystemStats.svelte to show "Running in Electron" instead of "Running in browser"
  - [x] Update components to use Svelte 5 syntax where applicable (runes, etc.)
- [x] Copy and convert store definitions
  - [x] Copy all stores from `/frontend/src/lib/stores/` to `/src/stores/`
  - [x] Convert JavaScript store files to TypeScript
  - [x] Update import paths in store files
  - [x] Update to use Svelte 5 reactivity system if needed
- [x] Copy and convert utility functions
  - [x] Copy all utilities from `/frontend/src/lib/utils/` to `/src/lib/utils/`
  - [x] Convert JavaScript utility files to TypeScript
  - [x] Copy configuration files from `/frontend/src/lib/config/` to `/src/lib/config/`
  - [x] Convert JavaScript configuration files to TypeScript
- [x] Adapt the routing structure
  - [x] Create appropriate routing for electron-vite (which doesn't use SvelteKit's routing)
  - [x] Ensure all pages are accessible
  - [x] Implement TypeScript interfaces for route parameters if needed

## IPC Implementation

- [x] Create the preload script (`electron/preload.ts`)
- [x] Create a new IPC service to replace socketService (`src/lib/services/ipcService.ts`)
  ```typescript
  /**
   * IPC Service
   * Manages the Electron IPC communication
   */
  import logger from '../utils/logger';
  import {
    updateRegions,
    updatePlaybackState,
    setStatusMessage,
    createErrorMessage,
    createInfoMessage,
    setConnected,
    setDisconnected,
    setReconnecting,
    setReconnected,
    setConnectionError,
    updatePingInfo,
    updateProjectId,
    updateMarkers,
    setMidiActive
  } from '../stores';

  // Define types for the data
  interface ConnectionStatus {
    connected: boolean;
    reason?: string;
    status?: string;
    pingLatency?: number;
  }

  interface Region {
    id: string;
    name: string;
    start: number;
    end: number;
    color?: string;
  }

  interface Marker {
    id: string;
    name: string;
    position: number;
    color?: string;
  }

  interface PlaybackState {
    isPlaying: boolean;
    position: number;
    currentRegionId?: string;
  }

  interface StatusMessage {
    type: 'info' | 'error' | 'warning';
    message: string;
    timestamp: number;
  }

  interface IpcControl {
    refreshRegions: () => Promise<Region[]>;
    seekToPosition: (position: number) => Promise<void>;
    togglePlay: () => Promise<void>;
    seekToRegion: (regionId: string) => Promise<void>;
    nextRegion: () => Promise<void>;
    previousRegion: () => Promise<void>;
    seekToCurrentRegionStart: () => Promise<void>;
    refreshProjectId: () => Promise<string>;
  }

  // Declare the electronAPI interface on the window object
  declare global {
    interface Window {
      electronAPI: {
        reportConnectionStatus: (status: ConnectionStatus) => void;
        refreshRegions: () => Promise<Region[]>;
        getRegions: () => Promise<Region[]>;
        togglePlay: () => Promise<void>;
        seekToPosition: (position: number) => Promise<void>;
        seekToRegion: (regionId: string) => Promise<void>;
        nextRegion: () => Promise<void>;
        previousRegion: () => Promise<void>;
        seekToCurrentRegionStart: () => Promise<void>;
        refreshProjectId: () => Promise<string>;
        getProjectId: () => Promise<string>;
        ping: () => Promise<string>;
        onRegionsUpdate: (callback: (data: Region[]) => void) => void;
        onMarkersUpdate: (callback: (data: Marker[]) => void) => void;
        onPlaybackStateUpdate: (callback: (data: PlaybackState) => void) => void;
        onStatusMessage: (callback: (data: StatusMessage) => void) => void;
        onProjectIdUpdate: (callback: (data: string) => void) => void;
        onProjectChanged: (callback: (projectId: string) => void) => void;
        onMidiActivity: (callback: () => void) => void;
        onConnectionChange: (callback: (status: ConnectionStatus) => void) => void;
        removeAllListeners: (channel: string) => void;
      };
    }
  }

  // Ping/pong mechanism variables
  let pingInterval: NodeJS.Timeout | null = null;
  let pingTimeout: NodeJS.Timeout | null = null;

  /**
   * Initializes the IPC communication
   * @returns {IpcControl} - IPC control interface
   */
  function initialize(): IpcControl {
    logger.log('Initializing IPC communication');
    
    // Set up event listeners
    setupEventListeners();
    
    // Start ping interval
    startPingInterval();
    
    // Return the IPC control interface
    return createIpcControl();
  }

  /**
   * Sets up event listeners for IPC events
   */
  function setupEventListeners(): void {
    // Register event listeners using the exposed electronAPI
    window.electronAPI.onRegionsUpdate(handleRegionsUpdate);
    window.electronAPI.onMarkersUpdate(handleMarkersUpdate);
    window.electronAPI.onPlaybackStateUpdate(handlePlaybackStateUpdate);
    window.electronAPI.onStatusMessage(handleStatusMessage);
    window.electronAPI.onProjectIdUpdate(handleProjectIdUpdate);
    window.electronAPI.onProjectChanged(handleProjectChanged);
    window.electronAPI.onMidiActivity(handleMidiActivity);
    window.electronAPI.onConnectionChange(handleConnectionChange);
    
    // Report initial connection status
    window.electronAPI.reportConnectionStatus({ 
      connected: false, 
      reason: 'initializing', 
      status: 'Initializing connection to backend'
    });
    
    // Refresh regions immediately
    setTimeout(() => {
      logger.log('Initial regions refresh...');
      window.electronAPI.refreshRegions();
    }, 500);
  }

  /**
   * Starts the ping interval for connection monitoring
   */
  function startPingInterval(): void {
    // Implementation similar to socketService but using IPC
    pingInterval = setInterval(() => {
      const startTime = Date.now();
      
      // Set a timeout for ping response
      if (pingTimeout) clearTimeout(pingTimeout);
      pingTimeout = setTimeout(() => {
        logger.warn('Ping timeout - no response from main process');
        setConnectionError('Ping timeout');
      }, 5000); // 5 seconds timeout
      
      // Send ping and wait for pong
      window.electronAPI.ping().then(() => {
        if (pingTimeout) clearTimeout(pingTimeout);
        const latency = Date.now() - startTime;
        logger.log(`Received pong from main process (latency: ${latency}ms)`);
        
        updatePingInfo(latency);
      });
    }, 10000); // 10 seconds interval
  }

  /**
   * Handles connection status changes
   */
  function handleConnectionChange(status: ConnectionStatus): void {
    if (status.connected) {
      setConnected();
    } else {
      setDisconnected();
    }
    
    // Update ping info if available
    if (status.pingLatency) {
      updatePingInfo(status.pingLatency);
    }
  }

  /**
   * Handles the regions update event
   */
  function handleRegionsUpdate(data: Region[]): void {
    logger.log('Received regions update:', data);
    updateRegions(data);
  }

  // Other handler functions similar to socketService
  function handleMarkersUpdate(data: Marker[]): void {
    logger.log('Received markers update:', data);
    updateMarkers(data);
  }
  
  function handlePlaybackStateUpdate(data: PlaybackState): void {
    updatePlaybackState(data);
  }
  
  function handleStatusMessage(data: StatusMessage): void {
    logger.log('Received status message:', data);
    setStatusMessage(data);
  }
  
  function handleProjectIdUpdate(data: string): void {
    logger.log('Received project ID update:', data);
    updateProjectId(data);
  }
  
  function handleProjectChanged(projectId: string): void {
    logger.log('Project changed detected, new project ID:', projectId);
    updateProjectId(projectId);
    
    // Refresh regions for the new project
    setTimeout(() => {
      logger.log('Refreshing regions after project change...');
      window.electronAPI.refreshRegions();
    }, 500);
  }
  
  function handleMidiActivity(): void {
    logger.log('MIDI activity detected');
    setMidiActive();
  }

  /**
   * Creates the IPC control interface
   */
  function createIpcControl(): IpcControl {
    return {
      refreshRegions: () => window.electronAPI.refreshRegions(),
      seekToPosition: (position: number) => window.electronAPI.seekToPosition(position),
      togglePlay: () => window.electronAPI.togglePlay(),
      seekToRegion: (regionId: string) => window.electronAPI.seekToRegion(regionId),
      nextRegion: () => window.electronAPI.nextRegion(),
      previousRegion: () => window.electronAPI.previousRegion(),
      seekToCurrentRegionStart: () => window.electronAPI.seekToCurrentRegionStart(),
      refreshProjectId: () => window.electronAPI.refreshProjectId()
    };
  }

  // Initialize the IPC service
  const ipcService = initialize();

  // Export the IPC service
  export default ipcService;
  ```

## Main Process Implementation

- [x] Create the main process file (`electron/main.ts`)
- [x] Create types file (`electron/types.ts`)
  ```typescript
  // Shared types between main and renderer processes

  export interface ConnectionStatus {
    connected: boolean;
    reason?: string;
    status?: string;
    pingLatency?: number;
  }

  export interface Region {
    id: string;
    name: string;
    start: number;
    end: number;
    color?: string;
  }

  export interface Marker {
    id: string;
    name: string;
    position: number;
    color?: string;
  }

  export interface PlaybackState {
    isPlaying: boolean;
    position: number;
    currentRegionId?: string;
  }

  export interface StatusMessage {
    type: 'info' | 'error' | 'warning';
    message: string;
    timestamp: number;
  }
  ```

- [ ] Create backend service (`electron/backend/backendService.ts`)
  ```typescript
  /**
   * Backend Service
   * Handles communication with REAPER and provides data to the renderer process
   */
  import { BrowserWindow } from 'electron';
  import { ReaperConnector } from './reaperConnector';
  import { ConnectionStatus, Region, Marker, PlaybackState } from '../types';
  
  let mainWindow: BrowserWindow | null = null;
  let reaperConnector: ReaperConnector | null = null;
  
  /**
   * Initialize the backend service
   * @param {BrowserWindow} window - The main window
   */
  export function initialize(window: BrowserWindow): { isConnected: () => boolean } {
    mainWindow = window;
    
    // Initialize REAPER connector
    reaperConnector = new ReaperConnector();
    reaperConnector.connect();
    
    // Set up event listeners for REAPER events
    setupReaperEventListeners();
    
    return {
      isConnected: () => reaperConnector ? reaperConnector.isConnected() : false
    };
  }
  
  /**
   * Set up event listeners for REAPER events
   */
  function setupReaperEventListeners(): void {
    if (!reaperConnector) return;
    
    // Listen for REAPER events and forward them to the renderer
    reaperConnector.on('regions', (regions: Region[]) => {
      if (mainWindow) {
        mainWindow.webContents.send('regions-update', regions);
      }
    });
    
    reaperConnector.on('markers', (markers: Marker[]) => {
      if (mainWindow) {
        mainWindow.webContents.send('markers-update', markers);
      }
    });
    
    reaperConnector.on('playbackState', (state: PlaybackState) => {
      if (mainWindow) {
        mainWindow.webContents.send('playback-state-update', state);
      }
    });
    
    reaperConnector.on('projectId', (projectId: string) => {
      if (mainWindow) {
        mainWindow.webContents.send('project-id-update', projectId);
      }
    });
    
    reaperConnector.on('projectChanged', (projectId: string) => {
      if (mainWindow) {
        mainWindow.webContents.send('project-changed', projectId);
      }
    });
    
    reaperConnector.on('midiActivity', () => {
      if (mainWindow) {
        mainWindow.webContents.send('midi-activity');
      }
    });
    
    reaperConnector.on('connectionChange', (status: ConnectionStatus) => {
      if (mainWindow) {
        mainWindow.webContents.send('connection-change', status);
      }
    });
  }
  
  // Export methods that will be called via IPC
  
  // Regions management
  export async function refreshRegions(): Promise<Region[]> {
    if (!reaperConnector) throw new Error('REAPER connector not initialized');
    return await reaperConnector.refreshRegions();
  }
  
  export async function getRegions(): Promise<Region[]> {
    if (!reaperConnector) throw new Error('REAPER connector not initialized');
    return await reaperConnector.getRegions();
  }
  
  // Playback control
  export async function togglePlay(): Promise<void> {
    if (!reaperConnector) throw new Error('REAPER connector not initialized');
    return await reaperConnector.togglePlay();
  }
  
  export async function seekToPosition(position: number): Promise<void> {
    if (!reaperConnector) throw new Error('REAPER connector not initialized');
    return await reaperConnector.seekToPosition(position);
  }
  
  export async function seekToRegion(regionId: string): Promise<void> {
    if (!reaperConnector) throw new Error('REAPER connector not initialized');
    return await reaperConnector.seekToRegion(regionId);
  }
  
  export async function nextRegion(): Promise<void> {
    if (!reaperConnector) throw new Error('REAPER connector not initialized');
    return await reaperConnector.nextRegion();
  }
  
  export async function previousRegion(): Promise<void> {
    if (!reaperConnector) throw new Error('REAPER connector not initialized');
    return await reaperConnector.previousRegion();
  }
  
  export async function seekToCurrentRegionStart(): Promise<void> {
    if (!reaperConnector) throw new Error('REAPER connector not initialized');
    return await reaperConnector.seekToCurrentRegionStart();
  }
  
  // Project management
  export async function refreshProjectId(): Promise<string> {
    if (!reaperConnector) throw new Error('REAPER connector not initialized');
    return await reaperConnector.refreshProjectId();
  }
  
  export async function getProjectId(): Promise<string> {
    if (!reaperConnector) throw new Error('REAPER connector not initialized');
    return await reaperConnector.getProjectId();
  }
  ```

## UI Updates

- [x] Update SystemStats.svelte to show Electron environment
- [x] Remove browser-specific code from all components

## Configuration Files

- [x] Create vite.config.ts
- [x] Create tsconfig.json
- [x] Create tsconfig.node.json
- [x] Update package.json
- [x] Create svelte.config.js

## Testing and Debugging

- [x] Test in development mode
- [x] Test all features
- [x] Test in production mode

## Building and Packaging

- [ ] Configure electron-builder in package.json
  ```json
  "build": {
    "appId": "com.example.reaper-control",
    "productName": "Reaper Control",
    "directories": {
      "output": "release/${version}"
    },
    "files": [
      "dist",
      "dist-electron"
    ],
    "mac": {
      "target": ["dmg"],
      "category": "public.app-category.music"
    },
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ]
    },
    "linux": {
      "target": ["AppImage"],
      "category": "Audio"
    }
  }
  ```

- [ ] Create build scripts
  - [ ] Add platform-specific build scripts to package.json
    ```json
    "scripts": {
      "build:mac": "pnpm build && electron-builder --mac",
      "build:win": "pnpm build && electron-builder --win",
      "build:linux": "pnpm build && electron-builder --linux"
    }
    ```
  - [ ] Test the build process with `pnpm build`
- [ ] Package the application
  - [ ] Create installers for different platforms using the build scripts
  - [ ] Test the installers on each platform

## Backend Implementation Plan

### Main Process Architecture

The main process will be structured as follows:

```
src/main/
├── index.ts                 # Main entry point
├── preload.ts               # Preload script for IPC
├── ipc/
│   ├── ipcHandler.ts        # IPC message handler
│   └── ipcChannels.ts       # IPC channel definitions
├── services/
│   ├── backendService.ts    # Main backend service
│   ├── reaperConnector.ts   # REAPER communication
│   ├── regionService.ts     # Region management
│   ├── markerService.ts     # Marker management
│   ├── midiService.ts       # MIDI input handling
│   └── projectService.ts    # Project management
└── utils/
    ├── logger.ts            # Logging utility
    └── config.ts            # Configuration
```

### REAPER Connector Implementation

The REAPER connector will be responsible for communicating with REAPER through its web interface. It will be implemented as a TypeScript class that provides methods for sending commands to REAPER and receiving responses.

#### Key Components

1. **Connection Management**
   - Connect to REAPER web interface
   - Handle connection errors and retries
   - Monitor connection status

2. **Command Handling**
   - Send commands to REAPER
   - Parse responses
   - Handle errors

3. **Data Retrieval**
   - Get regions
   - Get markers
   - Get transport state
   - Get project information

4. **Control Functions**
   - Toggle play/pause
   - Seek to position
   - Seek to region
   - Navigate between regions

### IPC Message Handlers

The IPC message handlers will be responsible for handling messages from the renderer process and sending responses back. They will also emit events to the renderer process when data changes.

#### IPC Channels

1. **From Renderer to Main**
   - `ping`: Check connection
   - `refreshRegions`: Refresh regions
   - `refreshMarkers`: Refresh markers
   - `togglePlay`: Toggle play/pause
   - `seekToPosition`: Seek to position
   - `seekToRegion`: Seek to region
   - `nextRegion`: Go to next region
   - `previousRegion`: Go to previous region
   - `seekToCurrentRegionStart`: Seek to current region start
   - `refreshProjectId`: Refresh project ID
   - `reportConnectionStatus`: Report connection status

2. **From Main to Renderer**
   - `regionsUpdate`: Regions updated
   - `markersUpdate`: Markers updated
   - `playbackStateUpdate`: Playback state updated
   - `statusMessage`: Status message
   - `projectIdUpdate`: Project ID updated
   - `projectChanged`: Project changed
   - `midiActivity`: MIDI activity detected
   - `connectionChange`: Connection status changed

### MIDI Integration

The MIDI service will be responsible for handling MIDI input events and triggering corresponding actions in the application.

#### Key Components

1. **Device Management**
   - Detect MIDI devices
   - Connect to MIDI devices
   - Handle device connection/disconnection

2. **Event Handling**
   - Listen for MIDI events
   - Map MIDI events to application actions
   - Trigger actions based on MIDI events

3. **Configuration**
   - Load MIDI configuration
   - Map MIDI notes to actions

### Backend Service Implementation

The backend service will be the main entry point for the backend functionality. It will initialize all other services and coordinate between them.

#### Key Components

1. **Service Initialization**
   - Initialize REAPER connector
   - Initialize region service
   - Initialize marker service
   - Initialize MIDI service
   - Initialize project service

2. **Event Coordination**
   - Forward events between services
   - Emit events to the renderer process

3. **Error Handling**
   - Handle errors from services
   - Report errors to the renderer process

### Implementation Steps

1. Implement the REAPER connector
2. Implement the region service
3. Implement the marker service
4. Implement the MIDI service
5. Implement the project service
6. Implement the backend service
7. Implement the IPC handler
8. Test the implementation
9. Document the implementation

## Key Differences from Socket-Based Implementation

1. **No Socket.IO**: Removed all Socket.IO dependencies and code
2. **No Browser Compatibility**: Removed all browser compatibility checks and fallbacks
3. **IPC Communication**: Added Electron IPC for communication between renderer and main processes
4. **Backend in Main Process**: Moved backend functionality to the Electron main process
5. **Simplified Configuration**: Removed proxy settings and other web-specific configurations
6. **Direct REAPER Integration**: The main process now communicates directly with REAPER
7. **No Separate Backend Server**: Eliminated the need for a separate backend server process
8. **TypeScript Implementation**: Converted all JavaScript code to TypeScript for better type safety and developer experience
9. **Svelte 5 Upgrade**: Updated from Svelte 4 to Svelte 5, utilizing new features like runes for reactivity
10. **PNPM Package Manager**: Switched from npm to pnpm for faster, more efficient dependency management
11. **Enhanced Type Safety**: Added comprehensive TypeScript interfaces for all data structures and API endpoints
12. **Modern Configuration**: Updated build tools and configuration files to support TypeScript and modern ES modules

This approach creates a more integrated, native-feeling Electron application with direct communication between the UI and REAPER through Electron's IPC mechanism, while also providing the benefits of TypeScript's type safety, Svelte 5's improved reactivity system, and pnpm's efficient package management.