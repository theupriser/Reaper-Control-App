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
- Python with distutils (required for native module compilation)
  - For Python 3.8-3.11: distutils is included in the standard library
  - For Python 3.12+: install setuptools (`pip install setuptools`)

### Setup

#### Standard Installation
```bash
# Install dependencies
pnpm install
```

#### Automated Installation (Recommended)

We provide automated installation scripts that handle Python environment setup:

```bash
# On macOS/Linux:
./install.sh

# On Windows:
install.bat
```

These scripts will:
1. Create a Python virtual environment with setuptools
2. Install all dependencies with pnpm

#### Troubleshooting Installation Issues

If you encounter errors related to Python or native module compilation during manual installation:

1. **Python distutils missing**:
   ```bash
   # Create a Python virtual environment with setuptools
   python -m venv .venv
   source .venv/bin/activate   # On Windows, use: .venv\Scripts\activate
   pip install setuptools

   # Then install dependencies
   pnpm install
   ```

2. **Alternative approach (skip native compilation)**:
   ```bash
   # Set environment variable to prefer prebuilt binaries
   # On Windows:
   set npm_config_build_from_source=false && pnpm install

   # On macOS/Linux:
   npm_config_build_from_source=false pnpm install
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
- MIDI control with customizable note mapping

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

## MIDI Configuration

The application supports MIDI control, allowing you to trigger various actions using MIDI notes from connected MIDI devices.

### Setting Up MIDI Control

1. Navigate to the Settings screen in the application
2. In the MIDI Settings section, ensure that MIDI is enabled
3. Optionally select a specific MIDI device (if none is selected, all devices will be monitored)
4. Choose a specific MIDI channel or set to "All Channels" to accept notes from any channel

### Configuring MIDI Note Mappings

You can assign specific MIDI notes to trigger different actions:

1. In the MIDI Note Mappings section, you'll see existing mappings (if any)
2. To add a new mapping:
   - Enter a MIDI note number (0-127)
   - Select an action from the dropdown
   - Click "Add Mapping"
3. To remove a mapping, click the "Remove" button next to it

### Available Actions

The following actions can be mapped to MIDI notes:

- **Toggle Play/Pause**: Start or stop playback
- **Pause**: Pause playback
- **Toggle Autoplay**: Enable/disable automatic progression to the next region
- **Toggle Count-In**: Enable/disable count-in before playback
- **Next Region**: Jump to the next region
- **Previous Region**: Jump to the previous region
- **Seek to Current Region Start**: Return to the beginning of the current region

### Using MIDI Control

Once configured, the application will listen for MIDI note-on messages from your connected devices. When a mapped note is received, the corresponding action will be triggered.

## GitHub CI/CD Pipeline

This project uses GitHub Actions for continuous integration and delivery across multiple platforms:

- **Automated Builds**: The pipeline automatically builds the application for Windows, macOS, and Linux.
- **Build Triggers**: Builds are triggered on:
  - Push to the `main` branch
  - Pull requests to the `main` branch
  - Release tags (format: `v*`)
- **Artifacts**: Build artifacts are uploaded and available for download from GitHub Actions.
- **Releases**: When pushing a version tag (e.g., `v1.0.0`), a draft GitHub release is automatically created with all build artifacts attached.

> **Note on GitHub Actions Compatibility**: The GitHub workflow uses `npm ci` for installation and will automatically use our postinstall script with the necessary environment variables to handle native dependencies. No additional configuration is needed as GitHub runners come with Python and setuptools pre-installed.

### Creating a Release

To create a new release:

1. Update the version in `package.json`
2. Commit the changes
3. Create and push a new tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. The GitHub workflow will build the application for all platforms and create a draft release
5. Edit the draft release on GitHub to add release notes, then publish it

## Future Enhancements

- Add more advanced REAPER control features
- Implement setlist export/import functionality

## License

This software is released under a proprietary Source Available License. The source code is visible for inspection and learning purposes, but all rights to use, copy, modify, distribute, and sell the software are reserved by the copyright holder.

See the [LICENSE](./LICENSE) file for the full terms and conditions.

Any use, distribution, or modification of this software requires explicit written permission from the copyright holder.

