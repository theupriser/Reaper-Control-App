/**
 * Socket Controller
 * Delegates Socket.IO handling to socketService
 * Also initializes MIDI service for MIDI input handling
 */

const logger = require('../utils/logger');
const socketService = require('../services/socketService');
const midiService = require('../services/midiService');

class SocketController {
  constructor(io) {
    this.io = io;
  }

  /**
   * Initialize Socket.IO connection handling and MIDI service
   */
  initialize() {
    // Initialize the socket service with the IO instance
    socketService.initialize(this.io);
    
    // Initialize the MIDI service
    midiService.initialize();
    
    // Set up connection handling
    this.io.on('connection', (socket) => socketService.handleConnection(socket));
    logger.log('Socket controller and MIDI service initialized');
  }

}

module.exports = SocketController;