# Frontend Library Structure

This document describes the structure and organization of the frontend library code, focusing on the SOLID principles applied to the socket and store management.

## Directory Structure

```
frontend/src/lib/
├── config/
│   └── socketConfig.js       # Socket configuration
├── stores/
│   ├── index.js              # Re-exports all stores
│   ├── regionStore.js        # Region-related stores
│   ├── playbackStore.js      # Playback state store
│   ├── statusStore.js        # Status message store
│   ├── connectionStore.js    # Connection status store
│   └── socket.js             # Backward compatibility layer
├── services/
│   ├── socketService.js      # Socket connection management
│   └── transportService.js   # Transport control commands
└── utils/
    └── storeUtils.js         # Utility functions for stores
```

## Module Responsibilities

### Config Module

The `socketConfig.js` file contains all configuration related to the Socket.IO connection:
- Backend server URL configuration
- Socket.IO connection options
- Ping/pong configuration
- Timeout values
- Browser environment detection

### Store Modules

Each store module is responsible for managing a specific type of state:

- **regionStore.js**: Manages the list of regions and the current region
  - `regions`: Writable store for the list of regions
  - `currentRegion`: Derived store for the current region
  - Helper functions for region operations

- **playbackStore.js**: Manages playback state
  - `playbackState`: Writable store for playback state (isPlaying, position, etc.)
  - `autoplayEnabled`: Writable store for autoplay toggle
  - Helper functions for playback state operations

- **statusStore.js**: Manages status messages
  - `statusMessage`: Writable store for status messages
  - Helper functions for creating and managing status messages

- **connectionStore.js**: Manages connection status
  - `connectionStatus`: Writable store for connection status
  - Helper functions for connection status operations

- **index.js**: Re-exports all stores for easier importing

- **socket.js**: Backward compatibility layer that re-exports all stores and functions from the new structure

### Service Modules

- **socketService.js**: Manages the Socket.IO connection
  - Socket initialization and configuration
  - Event handling
  - Reconnection logic
  - Ping/pong mechanism

- **transportService.js**: Handles transport control commands
  - Play/pause control
  - Seeking to positions and regions
  - Region navigation
  - Autoplay functionality

### Utility Modules

- **storeUtils.js**: Provides utility functions for working with stores
  - Getting store values
  - Updating store properties
  - Formatting time values

## Usage Examples

### Importing Stores

```javascript
// Import all stores from the index
import { regions, playbackState, statusMessage } from '$lib/stores';

// Or import specific stores from their modules
import { regions, currentRegion } from '$lib/stores/regionStore';
import { playbackState } from '$lib/stores/playbackStore';
```

### Using Services

```javascript
// Import the transport service
import { transportService } from '$lib/services/transportService';

// Use transport functions
transportService.togglePlay();
transportService.seekToRegion(regionId);

// Import the socket service
import socketService from '$lib/services/socketService';

// Use socket functions
socketService.emit('customEvent', data);
socketService.disconnect();
```

### Backward Compatibility

For backward compatibility with existing code, you can continue to import from the socket.js file:

```javascript
import { 
  socketControl, 
  regions, 
  playbackState, 
  statusMessage 
} from '$lib/stores/socket';

// Use as before
socketControl.togglePlay();
console.log($regions);
```

## SOLID Principles Applied

1. **Single Responsibility Principle (SRP)**
   - Each module has a single responsibility
   - Stores are separated by domain (regions, playback, status, connection)
   - Services are separated by function (socket, transport)

2. **Open/Closed Principle (OCP)**
   - The code is open for extension but closed for modification
   - New functionality can be added by creating new modules without modifying existing ones

3. **Liskov Substitution Principle (LSP)**
   - The backward compatibility layer ensures that existing code continues to work

4. **Interface Segregation Principle (ISP)**
   - Each module exposes only the functions and stores that are relevant to its responsibility
   - Clients only need to know about the interfaces they use

5. **Dependency Inversion Principle (DIP)**
   - High-level modules (transport service) depend on abstractions (stores, socket service)
   - Low-level modules (socket service) implement these abstractions