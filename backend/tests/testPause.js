/**
 * Test script for pause MIDI functionality
 * 
 * This script tests the pause MIDI functionality by sending a MIDI note 49 event.
 * It requires the easymidi library to be installed.
 * 
 * Usage: node testPause.js
 */

const easymidi = require('easymidi');
const fs = require('fs');
const path = require('path');

// Create a virtual MIDI output for testing
let output;
try {
  output = new easymidi.Output('Reaper Control Pause Test', true);
  console.log('Created virtual MIDI output: Reaper Control Pause Test');
} catch (error) {
  console.error('Failed to create virtual MIDI output:', error.message);
  console.log('This might be due to virtual MIDI ports not being supported on your system.');
  console.log('You can still test with a physical MIDI device if available.');
  process.exit(1);
}

// Load the MIDI configuration
let config;
try {
  const configPath = path.join(__dirname, '../config/midiConfig.json');
  const configData = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configData);
  console.log('Loaded MIDI configuration:', config);
} catch (error) {
  console.error('Error loading MIDI configuration:', error.message);
  process.exit(1);
}

// Function to send a MIDI note
function sendMidiNote(note, velocity = 127) {
  console.log(`Sending MIDI note ${note} on channel ${config.channel} with velocity ${velocity}`);
  
  output.send('noteon', {
    note: note,
    velocity: velocity,
    channel: config.channel
  });
  
  // Send note off after a short delay
  setTimeout(() => {
    output.send('noteoff', {
      note: note,
      velocity: 0,
      channel: config.channel
    });
    console.log(`Sent noteoff for note ${note}`);
  }, 100);
}

// Test the pause functionality
console.log('Testing pause functionality...');
console.log('Make sure the backend server is running and Reaper is playing to see the effect.');
console.log('This will send MIDI note 49 which should trigger the pause action.');

// Send the pause note (note 49)
setTimeout(() => {
  console.log('Sending pause command (note 49)...');
  sendMidiNote(49);
  
  // Close the output after a delay
  setTimeout(() => {
    output.close();
    console.log('Test completed. MIDI output closed.');
  }, 1000);
}, 1000); // Wait 1 second before sending the note

console.log('Test script running. Sending MIDI note in 1 second...');