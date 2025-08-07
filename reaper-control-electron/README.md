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

## Future Enhancements

- Implement actual REAPER communication
- Complete the Performer view
- Add setlist management functionality
