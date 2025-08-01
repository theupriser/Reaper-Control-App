# WebSocket Connection Fix for Docker Environment

## Issue Description
When running the application in Docker, the WebSocket connection was failing with the error "Failed to connect to server websocket error in docker". This was preventing the frontend from communicating with the backend.

## Root Cause
The issue was caused by two problems:

1. **Frontend Connection URL**: The frontend was using `window.location.hostname` to determine the backend server URL, which resolves to the Traefik hostname (`reaper-control.test`) instead of the Docker service name (`backend`). This was fixed in a previous update.

2. **Backend Server Binding**: The backend server was not explicitly binding to all network interfaces (0.0.0.0), which meant it was only listening on localhost (127.0.0.1) by default. In a Docker environment, the server needs to bind to all interfaces to accept connections from other containers.

## Solution
Two changes were made to fix the issue:

1. **Frontend Connection URL** (previously fixed):
   ```javascript
   const SOCKET_URL = typeof window !== 'undefined' 
     ? window.location.hostname === 'localhost' 
       ? `http://localhost:3000` 
       : `http://backend:3000` // Use Docker service name when not on localhost
     : 'http://localhost:3000'; // Fallback for server-side rendering
   ```

2. **Backend Server Binding** (current fix):
   Modified `backend/server.js` to explicitly bind to all interfaces:
   ```javascript
   const PORT = process.env.PORT || 3000;
   const HOST = '0.0.0.0'; // Bind to all interfaces to accept connections from other containers
   server.listen(PORT, HOST, () => {
     logger.log(`Server running on ${HOST}:${PORT}`);
     
     // Initialize the application after server starts
     initializeApp();
   });
   ```

## Testing Instructions

1. Build and start the Docker containers:
   ```bash
   docker-compose down
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

4. Check if the backend server is properly binding to all interfaces:
   ```bash
   docker-compose exec backend netstat -tulpn | grep 3000
   ```
   You should see something like:
   ```
   tcp        0      0 0.0.0.0:3000            0.0.0.0:*               LISTEN      -
   ```
   The `0.0.0.0:3000` indicates that the server is listening on all interfaces.