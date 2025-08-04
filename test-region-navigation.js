/**
 * Test script for region navigation
 * This script tests the region navigation functionality with and without a setlist selected
 */

const io = require('socket.io-client');

// Connect to the backend
const socket = io('http://localhost:3000');

// Track test state
let testStep = 0;
let testPassed = true;
let testMessages = [];

// Log function
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
  testMessages.push(message);
}

// Test steps
const testSteps = [
  // Step 0: Wait for connection and initial data
  () => {
    log('Test started: Region navigation with and without setlist');
    log('Waiting for connection and initial data...');
  },
  
  // Step 1: Test region navigation without setlist
  () => {
    log('Step 1: Testing region navigation without setlist');
    log('Setting selected setlist to null (all regions)');
    socket.emit('setSelectedSetlist', null);
    
    // Wait for playback state update
    setTimeout(() => {
      log('Requesting next region navigation');
      socket.emit('nextRegion');
      
      // Move to next step after a delay
      setTimeout(() => runNextStep(), 2000);
    }, 1000);
  },
  
  // Step 2: Test direct region selection without setlist
  () => {
    log('Step 2: Testing direct region selection without setlist');
    
    // Get the first region ID from the regions list
    const firstRegionId = regions && regions.length > 0 ? regions[0].id : null;
    
    if (firstRegionId) {
      log(`Selecting region with ID: ${firstRegionId}`);
      socket.emit('seekToRegion', firstRegionId);
      
      // Move to next step after a delay
      setTimeout(() => runNextStep(), 2000);
    } else {
      log('ERROR: No regions available for testing');
      testPassed = false;
      runNextStep();
    }
  },
  
  // Step 3: Test region navigation with setlist
  () => {
    log('Step 3: Testing region navigation with setlist');
    
    // Get the first setlist ID from the setlists list
    const firstSetlistId = setlists && setlists.length > 0 ? setlists[0].id : null;
    
    if (firstSetlistId) {
      log(`Setting selected setlist to: ${firstSetlistId}`);
      socket.emit('setSelectedSetlist', firstSetlistId);
      
      // Wait for playback state update
      setTimeout(() => {
        log('Requesting next region navigation with setlist');
        socket.emit('nextRegion');
        
        // Move to next step after a delay
        setTimeout(() => runNextStep(), 2000);
      }, 1000);
    } else {
      log('WARNING: No setlists available for testing, skipping setlist test');
      runNextStep();
    }
  },
  
  // Step 4: Test direct region selection with setlist
  () => {
    log('Step 4: Testing direct region selection with setlist');
    
    // Get the first region ID from the regions list
    const firstRegionId = regions && regions.length > 0 ? regions[0].id : null;
    
    if (firstRegionId) {
      log(`Selecting region with ID: ${firstRegionId} with setlist selected`);
      socket.emit('seekToRegion', firstRegionId);
      
      // Move to next step after a delay
      setTimeout(() => runNextStep(), 2000);
    } else {
      log('ERROR: No regions available for testing');
      testPassed = false;
      runNextStep();
    }
  },
  
  // Step 5: Finish test
  () => {
    log('Test completed');
    log(`Test result: ${testPassed ? 'PASSED' : 'FAILED'}`);
    
    // Disconnect and exit
    socket.disconnect();
    process.exit(testPassed ? 0 : 1);
  }
];

// Run the next test step
function runNextStep() {
  if (testStep < testSteps.length) {
    testSteps[testStep]();
    testStep++;
  }
}

// Store received data
let regions = [];
let setlists = [];
let playbackState = null;

// Set up event handlers
socket.on('connect', () => {
  log('Connected to backend');
  
  // Request initial data
  socket.emit('refreshRegions');
  
  // Start the test after a delay
  setTimeout(() => runNextStep(), 1000);
});

socket.on('disconnect', () => {
  log('Disconnected from backend');
});

socket.on('regions', (data) => {
  regions = data;
  log(`Received ${regions.length} regions`);
});

socket.on('playbackState', (data) => {
  playbackState = data;
  log(`Received playback state: ${JSON.stringify(data)}`);
});

// Request setlists via HTTP
const http = require('http');
http.get('http://localhost:3000/api/setlists', (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      setlists = JSON.parse(data);
      log(`Received ${setlists.length} setlists`);
    } catch (error) {
      log(`Error parsing setlists: ${error.message}`);
    }
  });
}).on('error', (error) => {
  log(`Error fetching setlists: ${error.message}`);
});

// Handle errors
socket.on('connect_error', (error) => {
  log(`Connection error: ${error.message}`);
  testPassed = false;
});

socket.on('error', (error) => {
  log(`Socket error: ${error.message}`);
  testPassed = false;
});

process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`);
  testPassed = false;
  process.exit(1);
});