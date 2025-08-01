/**
 * Test script to directly test communication with Reaper using the raw OSC package
 * This bypasses the reaper-osc package to help identify where the issues are occurring
 */

const osc = require('osc');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Configuration
const REAPER_HOST = process.env.REAPER_HOST || '127.0.0.1';
const REAPER_PORT = parseInt(process.env.REAPER_PORT || '9000');
const LOCAL_PORT = 8002; // Use a different port to avoid conflicts

console.log('OSC Configuration:');
console.log('- Reaper Host:', REAPER_HOST);
console.log('- Reaper Port:', REAPER_PORT);
console.log('- Local Port:', LOCAL_PORT);

// Create UDP port for OSC communication
const udpPort = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: LOCAL_PORT,
  remoteAddress: REAPER_HOST,
  remotePort: REAPER_PORT,
  metadata: true
});

// Add message handler
udpPort.on('message', (oscMsg, timeTag, info) => {
  console.log('Received OSC message:');
  console.log('- Address:', oscMsg.address);
  console.log('- Args:', JSON.stringify(oscMsg.args, null, 2));
  console.log('- From:', info.address + ':' + info.port);
  console.log('- Time Tag:', timeTag);
  console.log('- Full Message:', JSON.stringify(oscMsg, null, 2));
});

// Add error handler
udpPort.on('error', (error) => {
  console.error('OSC Error:', error);
});

// Open the port
udpPort.open();

// When the port is ready
udpPort.on('ready', async () => {
  console.log('OSC UDP Port ready, running tests...');
  
  // Function to send an OSC message and wait for a response
  function sendOSCMessage(address, args = []) {
    console.log(`\n--- Sending OSC message to ${address} ---`);
    udpPort.send({
      address: address,
      args: args
    });
    console.log('Message sent');
    
    // Return a promise that resolves after a delay
    return new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Run tests
  try {
    // Test 1: Get regions
    console.log('\n=== Test 1: Get Regions ===');
    await sendOSCMessage('/REGION');
    
    // Test 2: Get transport state
    console.log('\n=== Test 2: Get Transport State ===');
    await sendOSCMessage('/TRANSPORT');
    
    // Test 3: Play/Pause toggle
    console.log('\n=== Test 3: Play/Pause Toggle ===');
    await sendOSCMessage('/action/1007');
    
    // Test 4: Set position
    console.log('\n=== Test 4: Set Position ===');
    await sendOSCMessage('/SET/POS', [{ type: 'f', value: 0 }]);
    
    // Wait for any final responses
    console.log('\nWaiting for final responses...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\nTests completed. Closing port...');
    udpPort.close();
  } catch (error) {
    console.error('Error running tests:', error);
    udpPort.close();
  }
});

// Handle close event
udpPort.on('close', () => {
  console.log('OSC UDP Port closed');
  process.exit(0);
});