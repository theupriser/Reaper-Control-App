/**
 * Main Server
 * Entry point for the Reaper Control application
 * 
 * This server provides:
 * 1. A health check endpoint to indicate when initialization is complete
 * 2. Socket.IO connections for real-time communication with the frontend
 * 3. API endpoints for controlling Reaper
 * 4. Services for managing regions, projects, setlists, and markers
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import modules
const logger = require('./utils/logger');
const apiRoutes = require('./routes/apiRoutes');
const reaperService = require('./services/reaperService');
const regionService = require('./services/regionService');
const projectService = require('./services/projectService');
const setlistService = require('./services/setlistService');
const markerService = require('./services/markerService');
const SocketController = require('./controllers/socketController');

// Track application initialization status
// This flag is used by the health check endpoint to indicate when the backend is fully initialized
let isAppInitialized = false;

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Add a health check endpoint
// It returns 'ready' when all services are initialized, or 'initializing' otherwise
app.get('/health', (req, res) => {
  if (isAppInitialized) {
    res.status(200).json({ status: 'ready' });
  } else {
    res.status(200).json({ status: 'initializing' });
  }
});

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Initialize socket controller
const socketController = new SocketController(io);

// Initialize application
async function initializeApp() {
  try {
    // Connect to Reaper
    await reaperService.connect();
    
    // Initialize region service
    await regionService.initialize();
    
    // Initialize project service
    await projectService.initialize();
    
    // Initialize setlist service
    await setlistService.initialize();
    
    // Initialize marker service
    await markerService.initialize();
    
    // Initialize socket controller
    socketController.initialize();
    
    // Register API routes after all services are initialized
    app.use('/api', apiRoutes);
    
    // Mark application as initialized
    // This signals to the health check endpoint that the backend is fully ready
    isAppInitialized = true;
    
    logger.log('Application initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application:', error);
  }
}

// Start the server
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Bind to all interfaces to accept connections from other containers
server.listen(PORT, HOST, () => {
  logger.log(`Server running on ${HOST}:${PORT}`);
  
  // Initialize the application after server starts
  initializeApp();
});