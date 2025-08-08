# Reaper Control Electron

A desktop application for controlling REAPER DAW, built with Electron, TypeScript, and Svelte.

## Project Overview

This project is a migration of the web-based Reaper Control application to an Electron desktop application. The key changes include:

- Replaced Socket.IO communication with Electron IPC
- Converted JavaScript to TypeScript
- Implemented a native desktop application experience
- Added a simple navigation system for different views

## Development

### Prerequisites

- Node.js 16+
- pnpm

### Setup

```bash
# Install dependencies
pnpm install
```

### Development Mode

```bash
# Start the application in development mode
pnpm dev
```

### Build

```bash
# Build the application
pnpm build
```

## Testing

To test the application in development mode:

1. Start the application with `pnpm dev`
2. Test the following functionality:
   - Navigation between views (Main, Performer, Setlists)
   - Transport controls (Play/Pause, Next Region, Previous Region)
   - Region list display and selection
   - System stats display
   - Connection status display

## Project Structure

- `src/main/` - Electron main process code
  - `index.ts` - Main entry point
  - `backend/` - Backend service for REAPER communication
- `src/preload/` - Preload script for secure IPC
- `src/renderer/` - Renderer process (frontend) code
  - `src/` - Svelte components and stores
    - `components/` - Svelte components
    - `stores/` - Svelte stores
    - `lib/` - Utilities and configuration
    - `services/` - Services for IPC communication

## Features

- REAPER communication and control
- Transport controls (Play/Pause, Next Region, Previous Region)
- Region navigation and selection
- Setlist management and navigation
- Automatic navigation at the end of a region
- Auto-resume feature (only continues playback when navigating between songs if playback was already playing)
- Performer view for live performances
- Setlist storage in Reaper's extended state for project portability

## Custom Markers

The application supports special markers that can be added to region names in Reaper to provide additional functionality:

### !bpm Marker

The `!bpm` marker allows you to specify the tempo (Beats Per Minute) for a region.

- **Format**: `!bpm:120` (where the number is the BPM value)
- **Usage**: Add this marker to a region name in Reaper
- **Example**: `Verse !bpm:128.5` (sets the tempo to 128.5 BPM for the region)
- **Behavior**: When navigating to a region with a !bpm marker, the application will use this BPM value for internal calculations such as determining count-in duration. Note that this does not actually change Reaper's project tempo.

Put this marker anywhere in the region name. For example: `Intro !bpm:120` or `Verse (Slow) !bpm:85`.

### Combined Usage

Multiple markers can be used together in the same region name:

- **Example**: `Chorus !length:45 !bpm:140` (uses both a custom length and a BPM value)

The markers can appear anywhere in the region name and in any order.

## Future Enhancements

- Enhance the Performer view with more features
- Add more advanced REAPER control features
- Implement setlist export/import functionality
