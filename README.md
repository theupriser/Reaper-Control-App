# Reaper Control

Remote control application for Reaper DAW.

## Features

- Remote playback control for Reaper
- Region navigation
- Real-time status updates
- WebSocket connection monitoring
- MIDI input control

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

### Logging Configuration

The application supports configurable logging through environment variables:

#### General Logging

- `NODE_ENV`: Set to `production` to disable most logs, or `development` to enable detailed logging
- `LOG_BUNDLE_SIZE`: Maximum number of logs to collect before flushing (default: 20)
- `LOG_BUNDLE_TIMEOUT`: Maximum time in milliseconds to wait before flushing logs (default: 2000)

#### Feature-specific Logging

- `MIDI_LOG_ALL`: Set to `true` to log all MIDI input events, not just mapped notes
- `PLAYBACK_STATE_LOG`: Set to `true` to log detailed playback state updates
- `WEB_ADAPTER_LOG`: Set to `true` to log detailed web adapter communication
- `SOCKET_EVENT_LOG`: Set to `true` to log detailed socket event communication
- `SOCKET_CONNECTION_LOG`: Set to `true` to log detailed socket connection information

These settings can be configured in the `.env` file.

## MIDI Control

The application supports MIDI input control, allowing you to trigger actions using MIDI notes from any connected MIDI device.

### MIDI Configuration

MIDI settings are configured in the `/backend/config/midiConfig.json` file:

```json
{
  "channel": 0,
  "noteMapping": {
    "togglePlay": 50,
    "pause": 49,
    "seekToPosition": 51,
    "seekToRegion": 52,
    "seekToCurrentRegionStart": 53,
    "nextRegion": 54,
    "previousRegion": 55,
    "refreshRegions": 56,
    "toggleAutoplay": 57
  }
}
```

- `channel`: The MIDI channel to listen on (0-15)
- `noteMapping`: Maps MIDI note numbers to specific actions

### Available MIDI Actions

- `togglePlay` (Note 50): Toggle play/pause
- `pause` (Note 49): Always pauses Reaper
- `seekToPosition` (Note 51): Seek to position 0
- `seekToRegion` (Note 52): Seek to the first region
- `seekToCurrentRegionStart` (Note 53): Seek to the start of the current region
- `nextRegion` (Note 54): Go to the next region
- `previousRegion` (Note 55): Go to the previous region
- `refreshRegions` (Note 56): Refresh the regions list
- `toggleAutoplay` (Note 57): Toggle autoplay on

### How It Works

1. The application detects all available MIDI input devices on startup
2. It listens for noteOn events on the configured MIDI channel
3. When a mapped note is received, it triggers the corresponding action
4. The action is executed in the same way as if it was triggered via the web interface

### Requirements

- MIDI input device(s) connected to the server
- Node.js with easymidi library (automatically installed with npm)