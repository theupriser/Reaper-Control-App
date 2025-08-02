/**
 * Main Server
 * Entry point for the Reaper Control application
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
const SocketController = require('./controllers/socketController');

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

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
    
    // Initialize socket controller
    socketController.initialize();
    
    // Register API routes after all services are initialized
    app.use('/api', apiRoutes);
    
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