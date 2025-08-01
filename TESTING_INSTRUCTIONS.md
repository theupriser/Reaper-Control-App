# Testing WebSocket Connection in Docker

This document provides instructions for testing the WebSocket connection between the frontend and backend services when running in Docker.

## Changes Made

The WebSocket connection URL in `frontend/src/lib/stores/socket.js` has been updated to use the Docker service name 'backend' instead of `window.location.hostname` when the application is not running on localhost:

```javascript
const SOCKET_URL = typeof window !== 'undefined' 
  ? window.location.hostname === 'localhost' 
    ? `http://localhost:3000` 
    : `http://backend:3000` // Use Docker service name when not on localhost
  : 'http://localhost:3000'; // Fallback for server-side rendering
```

## Testing Instructions

1. Build and start the Docker containers:
   ```bash
   docker-compose up --build
   ```

2. Access the frontend application using the URL specified in the Traefik configuration:
   ```
   http://reaper-control.test
   ```

3. Open the browser's developer tools (F12 or right-click and select "Inspect") and go to the Console tab.

4. Check for any WebSocket connection errors. If the connection is successful, you should see log messages like:
   ```
   Initializing socket connection to: http://backend:3000
   Connected to backend server: http://backend:3000
   Socket ID: [socket-id]
   ```

5. If the application is working correctly, you should be able to see and interact with the regions list and playback controls.

## Troubleshooting

If you still encounter WebSocket connection issues:

1. Check that both frontend and backend containers are running:
   ```bash
   docker-compose ps
   ```

2. Check the logs for both services:
   ```bash
   docker-compose logs frontend
   docker-compose logs backend
   ```

3. Verify that the backend service is accessible from the frontend container:
   ```bash
   docker-compose exec frontend ping backend
   ```

4. If needed, you can modify the socket.js file to add more detailed logging:
   ```javascript
   console.log('Window location hostname:', window.location.hostname);
   console.log('Using Socket URL:', SOCKET_URL);
   ```

5. Restart the containers after making any changes:
   ```bash
   docker-compose down
   docker-compose up --build
   ```