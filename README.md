# Reaper Control

Remote control application for Reaper DAW.

## Features

- Remote playback control for Reaper
- Region navigation
- Real-time status updates
- WebSocket connection monitoring
- MIDI input control
- Performer Mode for live performances

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

When running the application with `npm run dev` or `npm run start`, the system will automatically copy `.env.example` to `.env` if it doesn't exist, and then create softlinks to the `.env` file in both the frontend and backend directories.

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
- `BPM_UTILS_LOG`: Set to `true` to log detailed BPM calculation information
- `SOCKET_EVENT_LOG`: Set to `true` to log detailed socket event communication
- `SOCKET_CONNECTION_LOG`: Set to `true` to log detailed socket connection information
- `REAPER_SERVICE_LOG`: Set to `true` to log detailed ReaperService operations
- `SETLIST_NAVIGATION_SERVICE_LOG`: Set to `true` to log detailed SetlistNavigationService operations

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

## Performer Mode

The application includes a dedicated Performer Mode designed for live performances, providing a fullscreen interface with essential information and controls.

### Performer Mode Features

- Fullscreen, distraction-free interface optimized for live use
- Large, clear display of current song name and timing information
- Preview of the next song in the setlist
- Real-time progress bar for the current song
- Elapsed and remaining time displays for both current song and total setlist
- Current time display for stage timing reference
- Auto-resume toggle for automatic playback continuation
- Large, touch-friendly transport controls
- Responsive design that works on various screen sizes

### Accessing Performer Mode

1. Navigate to the main application interface
2. Click the "Performer Mode" button in the navigation bar
3. The interface will switch to fullscreen Performer Mode
4. To exit, click the "Exit Performer Mode" button at the bottom of the screen

### Keyboard Shortcuts

Performer Mode supports the following keyboard shortcuts for quick control:

- **Space bar**: Toggle play/pause
- **Right arrow**: Go to next song
- **Left arrow**: Go to previous song
- **A key**: Toggle auto-resume feature

### Setlist Integration

Performer Mode works with the application's setlist feature:

- If a setlist is selected, it will display songs in the setlist order
- The "Next" song preview shows the upcoming song from the setlist
- Total time calculations are based on the current setlist
- Without a setlist, it works with all regions in the project

## Interactive Timeline and Markers

The application provides an interactive timeline that allows you to navigate through your project by clicking on the progress bar and markers.

### Marker Clicking

You can click directly on markers in the progress bar to jump to specific positions:

- Clicking near a marker (within 10 pixels) will seek to the exact marker position
- Clicking elsewhere on the progress bar will seek to the corresponding position based on the percentage
- A time popover appears when hovering over the progress bar, showing the position you're about to seek to

### Count-in Feature

The application includes a count-in feature that can be used when clicking on markers:

- **Toggle**: Enable/disable using the "Count-in when pressing marker" switch in the transport controls
- **Functionality**: When enabled and you click on a marker, playback will start with a count-in
- **How it works**: The cursor is positioned 2 bars before the marker and then playback starts
- **Purpose**: This helps musicians prepare for the upcoming section with a rhythmic count-in

This feature is specifically designed for marker clicks and is not used for region selection or navigation buttons.

## Custom Markers

The application supports special markers that can be added to region names in Reaper to provide additional functionality:

### !length Marker

The `!length` marker allows you to specify a custom length for a region, overriding the actual region length in Reaper.

`Important! Only use once!`

- **Format**: `!length:123.45` (where the number is the length in seconds)
- **Usage**: Add this marker to a region name in Reaper
- **Example**: `Intro !length:30` (sets a custom length of 30 seconds for the region)

This is useful when you want the application to use a different duration than the actual region length, such as for timing calculations or automatic playback transitions. This marker is mostly combined with the `!1008` marker. Reaper-control will add the length of this marker to the total length of the set and makes sure the timeline continues running when reaper has stopped playing. Use this purely for time speculation and foresight.

### !bpm Marker

The `!bpm` marker allows you to specify the tempo (Beats Per Minute) for a region.

`Important! Only use once!`

- **Format**: `!bpm:120` (where the number is the BPM value)
- **Usage**: Add this marker to a region name in Reaper
- **Example**: `Verse !bpm:128.5` (sets the tempo to 128.5 BPM for the region)

When navigating to a region with a !bpm marker, the application will automatically set Reaper's tempo to the specified value.
Put this before a song, just after the beginning of the region `.001` seconds in the Reaper timeline is enough offset. This makes sure it's visible in the region.

### Combined Usage

These markers can be used together in the same region name:

- **Example**: `Chorus !length:45 !bpm:140` (sets both a custom length of 45 seconds and a tempo of 140 BPM)

The markers can appear anywhere in the region name and in any order.

## Reaper Markers

### !1008 Marker

The `!1008` marker indicates that playback should stop at the end of the region rather than continuing to the next region.

- **Format**: `!1008`
- **Usage**: Add this marker to a region name in Reaper
- **Example**: `Verse !1008` (forces playback to stop at the end of the region)

This is useful for regions that should not automatically transition to the next region, such as the end of a song or a section that requires manual control.