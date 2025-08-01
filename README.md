# Reaper Control

Remote control application for Reaper DAW.

## Features

- Remote playback control for Reaper
- Region navigation
- Real-time status updates
- WebSocket connection monitoring

## WebSocket Connection Status

The application now includes a WebSocket connection status indicator that shows whether the connection between the frontend and backend is active. This helps diagnose connection issues and provides a way to manually reconnect if needed.

### Connection Status Features

- Visual indicator showing if the connection is active (green) or disconnected (red)
- Connection status text (Connected, Reconnecting, Disconnected)
- Last ping time and latency for active connections
- Error details for failed connections
- Manual reconnect button when disconnected

### How It Works

1. The frontend sends a ping to the backend every 10 seconds
2. The backend responds with a pong
3. The frontend measures the round-trip time (latency)
4. The connection status is updated based on these pings and other socket events
5. The ConnectionStatus component displays this information to the user

### Testing the Connection

To test if the WebSocket connection is working:

1. Start the application using `docker-compose up`
2. Open the application in a browser
3. Check the connection status indicator in the header section
   - A green dot indicates an active connection
   - The latency shows the response time in milliseconds

To test disconnection handling:

1. Stop the backend service while keeping the frontend running:
   ```
   docker-compose stop backend
   ```
2. Observe the connection status change to "Disconnected" with a red indicator
3. The reconnect button should appear
4. Start the backend service again:
   ```
   docker-compose start backend
   ```
5. Click the reconnect button or wait for automatic reconnection attempts

## Development

### Prerequisites

- Docker and Docker Compose
- Node.js (for local development)

### Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and adjust settings if needed
3. Run `docker-compose up` to start the application

### Project Structure

- `/backend` - Node.js backend with Socket.IO server
- `/frontend` - Svelte frontend application