/**
 * MIDI Test Script
 * 
 * This script tests the MIDI functionality by simulating MIDI input events.
 * It requires the easymidi library to be installed.
 * 
 * Usage: node midiTest.js
 */

const easymidi = require('easymidi');
const fs = require('fs');
const path = require('path');

// Create a virtual MIDI output for testing
let output;
try {
  output = new easymidi.Output('Reaper Control Test', true);
  console.log('Created virtual MIDI output: Reaper Control Test');
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

// Test all configured MIDI notes
console.log('Testing all configured MIDI notes...');
console.log('Make sure the backend server is running to see the effects.');

const noteMapping = config.noteMapping;
const notes = Object.entries(noteMapping);

// Send each note with a delay between them
notes.forEach(([action, note], index) => {
  setTimeout(() => {
    console.log(`Testing action: ${action}`);
    sendMidiNote(note);
    
    // Close the output after the last note
    if (index === notes.length - 1) {
      setTimeout(() => {
        output.close();
        console.log('Test completed. MIDI output closed.');
      }, 500);
    }
  }, index * 1000); // 1 second between each note
});

console.log('Test script running. Sending MIDI notes...');