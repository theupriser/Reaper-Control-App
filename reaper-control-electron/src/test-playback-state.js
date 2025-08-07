// Test script to simulate different playback state update scenarios
const { ipcMain } = require('electron');

// Simulate sending different playback state updates to the renderer process
function testPlaybackStateUpdates() {
  console.log('Testing playback state updates...');

  // Test cases with different combinations of missing fields
  const testCases = [
    {
      name: 'Complete playback state',
      data: {
        isPlaying: true,
        position: 10.5,
        currentRegionId: '2',
        selectedSetlistId: 'setlist-1',
        bpm: 120,
        timeSignature: {
          numerator: 4,
          denominator: 4
        }
      }
    },
    {
      name: 'Missing selectedSetlistId',
      data: {
        isPlaying: false,
        position: 20.5,
        currentRegionId: '3',
        bpm: 130,
        timeSignature: {
          numerator: 3,
          denominator: 4
        }
      }
    },
    {
      name: 'Missing timeSignature',
      data: {
        isPlaying: true,
        position: 30.5,
        currentRegionId: '4',
        selectedSetlistId: 'setlist-2',
        bpm: 140
      }
    },
    {
      name: 'Missing bpm',
      data: {
        isPlaying: false,
        position: 40.5,
        currentRegionId: '5',
        selectedSetlistId: 'setlist-3',
        timeSignature: {
          numerator: 6,
          denominator: 8
        }
      }
    },
    {
      name: 'Missing currentRegionId',
      data: {
        isPlaying: true,
        position: 50.5,
        selectedSetlistId: 'setlist-4',
        bpm: 150,
        timeSignature: {
          numerator: 5,
          denominator: 4
        }
      }
    },
    {
      name: 'Minimal playback state (only required fields)',
      data: {
        isPlaying: false,
        position: 60.5
      }
    }
  ];

  // Send each test case to the renderer process
  let index = 0;
  const interval = setInterval(() => {
    if (index >= testCases.length) {
      clearInterval(interval);
      console.log('All test cases sent.');
      return;
    }

    const testCase = testCases[index];
    console.log(`Sending test case: ${testCase.name}`);
    console.log('Data:', JSON.stringify(testCase.data, null, 2));

    // Send the playback state update to the renderer process
    if (global.mainWindow) {
      global.mainWindow.webContents.send('playback-state-update', testCase.data);
    } else {
      console.error('mainWindow is not available');
    }

    index++;
  }, 2000); // Send a test case every 2 seconds
}

// Export the test function
module.exports = {
  testPlaybackStateUpdates
};

// If this script is run directly, execute the test
if (require.main === module) {
  console.log('This script should be imported and called from the main process.');
}
