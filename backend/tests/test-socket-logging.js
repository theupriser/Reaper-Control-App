/**
 * Test script for socket event logging
 * 
 * This script tests the socket event logging functionality with different environment variables.
 * Run with: node test-socket-logging.js
 */

// Import required modules
const logger = require('../utils/logger');

// Mock Socket.IO socket for testing
class MockSocket {
  constructor(id) {
    this.id = id;
    this.events = {};
  }

  on(event, handler) {
    this.events[event] = handler;
    return this;
  }

  emit(event, data) {
    console.log(`Socket ${this.id} emitted ${event}:`, data);
    return this;
  }

  // Simulate triggering an event
  triggerEvent(event, ...args) {
    if (this.events[event]) {
      this.events[event](...args);
    }
  }
}

// Mock region service for testing
const mockRegionService = {
  getRegions: () => [{ id: 1, name: 'Test Region', start: 0, end: 10 }],
  getPlaybackState: () => ({ isPlaying: false, currentPosition: 0, currentRegionId: null }),
  on: (event, handler) => {}
};

// Test function
async function testSocketLogging() {
  console.log('=== Testing Socket Event Logging ===');
  
  // Override the region service import in socketService
  jest.mock('../services/regionService', () => mockRegionService);
  
  // Test 1: Test socket connection logging
  console.log('\n--- Test 1: Socket Connection Logging ---');
  console.log('SOCKET_CONNECTION_LOG =', process.env.SOCKET_CONNECTION_LOG);
  
  // Create a mock socket
  const socket = new MockSocket('test-socket-1');
  
  // Import the socket service (this will use our mocked dependencies)
  const socketService = require('../services/socketService');
  
  // Test connection handling
  console.log('Testing handleConnection...');
  socketService.handleConnection(socket);
  
  if (process.env.SOCKET_CONNECTION_LOG === 'true') {
    console.log('Socket connection logging is enabled, detailed logs would be shown');
  } else {
    console.log('Socket connection logging is disabled, only basic logs would be shown');
  }
  
  // Test 2: Test socket event logging
  console.log('\n--- Test 2: Socket Event Logging ---');
  console.log('SOCKET_EVENT_LOG =', process.env.SOCKET_EVENT_LOG);
  
  // Simulate a socket event
  console.log('Simulating togglePlay event...');
  socket.triggerEvent('togglePlay');
  
  if (process.env.SOCKET_EVENT_LOG === 'true') {
    console.log('Socket event logging is enabled, detailed logs would be shown');
  } else {
    console.log('Socket event logging is disabled, no detailed logs would be shown');
  }
  
  console.log('\n=== Socket Logging Test Complete ===');
}

// Set environment variables for testing
// You can modify these values to test different configurations
process.env.SOCKET_CONNECTION_LOG = process.env.SOCKET_CONNECTION_LOG || 'false';
process.env.SOCKET_EVENT_LOG = process.env.SOCKET_EVENT_LOG || 'false';

// Mock jest for testing
global.jest = {
  mock: (path, factory) => {
    console.log(`Mocking module: ${path}`);
    return factory();
  }
};

// Run the test
testSocketLogging().catch(error => {
  console.error('Error in test:', error);
});