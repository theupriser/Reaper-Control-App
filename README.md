# Reaper Control Queue

A web-based queue system for Cockos Reaper that allows you to control and navigate through regions during live performances. Built with SvelteKit 5 for the frontend and Node.js for the backend, with real-time communication via Socket.IO.

## Features

- View a setlist of all regions in your Reaper project
- Play, pause, and navigate between regions
- Seek to the beginning of the current region to restart a song
- Real-time updates of playback position and state
- Responsive design for both desktop and mobile use
- Background Node.js server that communicates with Reaper via its web interface

## Project Structure

The project is divided into two main parts:

- **Backend**: Node.js server that communicates with Reaper via its web interface and provides a Socket.IO interface for the frontend
- **Frontend**: SvelteKit 5 application that provides the user interface for controlling Reaper

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- [npm](https://www.npmjs.com/) (v7 or later)
- [Cockos Reaper](https://www.reaper.fm/) with web interface enabled (port 8080)

## Setup

### 1. Reaper Configuration

1. Open Reaper and go to `Preferences > Control/OSC/web`
2. Enable the built-in web interface:
   - Check "Enable web interface" option
   - Set the port to 8080 (default)
   - Access control can be set to your preference (none for local use)
   - No authentication is required for local use
3. Make sure Reaper is running and the web interface is accessible at `http://localhost:8080`

### 2. Backend Setup

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure the environment variables by editing the `.env` file:
   ```
   # Server configuration
   PORT=3000

   # Reaper host configuration
   REAPER_HOST=127.0.0.1

   # Reaper Web Interface configuration (currently in use)
   REAPER_WEB_PORT=8080

   # Reaper OSC configuration (kept for backward compatibility)
   REAPER_PORT=8000
   LOCAL_PORT=9000
   ```

4. Start the backend server:
   ```
   npm start
   ```

### 3. Frontend Setup

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`

## Usage

### Regions in Reaper

For the application to work properly, you need to have regions defined in your Reaper project:

1. In Reaper, position the cursor where you want a region to start
2. Press Shift+R or right-click on the timeline and select "Insert region"
3. Name your region (this will appear in the setlist)
4. Adjust the start and end points of the region as needed

### Using the Queue

1. Make sure both the backend server and frontend are running
2. Open the application in your browser (or on your mobile device)
3. The setlist will show all regions from your Reaper project
4. Use the transport controls to:
   - Play/Pause: Toggle playback
   - Previous: Go to the previous region
   - Restart: Jump to the beginning of the current region
   - Next: Go to the next region
   - Refresh: Update the region list from Reaper
5. Click on any region in the setlist to jump directly to it

## Development

### Backend

The backend is built with:
- Express.js for the HTTP server
- Socket.IO for real-time communication with the frontend
- HTTP client for communication with Reaper's web interface

Key files:
- `server.js`: Main server file with Socket.IO and Reaper web interface setup
- `adapters/reaper-web-adapter.js`: Adapter for communicating with Reaper's web interface
- `.env`: Configuration variables

### Frontend

The frontend is built with:
- SvelteKit 5 for the framework
- Socket.IO client for real-time communication with the backend

Key files and directories:
- `src/lib/stores/socket.js`: Socket.IO connection and state management
- `src/lib/components/`: UI components
- `src/routes/`: SvelteKit routes

## Troubleshooting

### Connection Issues

- Make sure Reaper is running and the web interface is enabled on port 8080
- Verify you can access Reaper's web interface directly at http://localhost:8080
- Check that the REAPER_WEB_PORT in the `.env` file matches the port in Reaper's web interface configuration
- Ensure the backend server is running before starting the frontend
- Check the browser console and backend terminal for any error messages

### Region Detection Issues

- Make sure you have regions defined in your Reaper project
- Try clicking the "Refresh Regions" button in the application
- Check that the regions are properly defined with start and end points

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Cockos Reaper](https://www.reaper.fm/) for the amazing DAW and its built-in web interface
- [SvelteKit](https://kit.svelte.dev/) for the frontend framework
- [Socket.IO](https://socket.io/) for real-time communication
- [Reaper Web Interface Documentation](https://www.reaper.fm/sdk/reascript/reascripthelp.html#HTTP_Server) for the API reference