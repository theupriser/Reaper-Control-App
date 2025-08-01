# WebSocket Connection Fix for Docker Environment

## Issue Description
When running the application in Docker, the WebSocket connection was failing with the error "Failed to connect to server websocket error in docker". This was preventing the frontend from communicating with the backend.

## Root Cause
The issue was caused by two problems:

1. **Frontend Connection URL**: In the `frontend/src/lib/stores/socket.js` file, the WebSocket URL was configured as:
```javascript
const SOCKET_URL = typeof window !== 'undefined' 
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000'; // Fallback for server-side rendering
```

When running in Docker:
- The frontend container is accessible via the hostname configured in Traefik (`reaper-control.test`)
- The backend container is accessible within the Docker network via its service name (`backend`)
- The browser's `window.location.hostname` would be `reaper-control.test`, not `backend`
- This caused the WebSocket connection to fail as it was trying to connect to `http://reaper-control.test:3000` instead of `http://backend:3000`

2. **Backend Server Binding**: The backend server was not explicitly binding to all network interfaces (0.0.0.0), which meant it was only listening on localhost (127.0.0.1) by default. In a Docker environment, the server needs to bind to all interfaces to accept connections from other containers.

## Solution
Two changes were made to fix the issue:

1. **Frontend Connection URL**:
Modified the `frontend/src/lib/stores/socket.js` file to use the correct hostname for the backend service when running in Docker:

```javascript
const SOCKET_URL = typeof window !== 'undefined' 
  ? window.location.hostname === 'localhost' 
    ? `http://localhost:3000` 
    : `http://backend:3000` // Use Docker service name when not on localhost
  : 'http://localhost:3000'; // Fallback for server-side rendering
```

This change ensures that:
- When running locally for development (hostname is 'localhost'), it connects to `http://localhost:3000`
- When running in Docker (hostname is not 'localhost'), it connects to `http://backend:3000`
- For server-side rendering, it falls back to `http://localhost:3000`

2. **Backend Server Binding**:
Modified the `backend/server.js` file to explicitly bind to all interfaces:

```javascript
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Bind to all interfaces to accept connections from other containers
server.listen(PORT, HOST, () => {
  logger.log(`Server running on ${HOST}:${PORT}`);
  
  // Initialize the application after server starts
  initializeApp();
});
```

This change ensures that the backend server is listening on all network interfaces (0.0.0.0) instead of just localhost (127.0.0.1), allowing it to accept connections from other containers in the Docker network.

## Testing
Detailed testing instructions are provided in the `TESTING_INSTRUCTIONS.md` file. The key steps are:
1. Build and start the Docker containers with `docker-compose up --build`
2. Access the frontend application at `http://reaper-control.test`
3. Check the browser console for successful WebSocket connection messages
4. Verify that the application functions correctly (regions list and playback controls work)

## Additional Notes
- This solution assumes that the application is always accessed via `localhost` when running locally and via a different hostname when running in Docker
- If there are other development environments where the hostname is not `localhost`, additional logic may be needed
- The solution maintains backward compatibility with the existing local development setup