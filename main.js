/**
 * Electron Main Process
 * Entry point for the Electron application
 * 
 * This file handles:
 * 1. Starting the backend server as a child process
 * 2. Waiting for the backend to be fully initialized
 * 3. Creating the Electron window and loading the frontend
 * 4. Managing the application lifecycle
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const url = require('url');
const http = require('http');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow;

// Keep a reference to the backend process
let backendProcess;

/**
 * Checks if the backend server is ready by polling the health endpoint
 * @returns {Promise<boolean>} - Promise that resolves to true when backend is ready
 */
function checkBackendReady() {
  return new Promise((resolve) => {
    console.log('Checking if backend server is ready...');
    
    // Function to make a request to the health endpoint
    const checkHealth = () => {
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/health',
        method: 'GET'
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            console.log('Backend health check response:', response);
            
            if (response.status === 'ready') {
              console.log('Backend server is ready!');
              resolve(true);
            } else {
              console.log('Backend server is still initializing, waiting...');
              setTimeout(checkHealth, 500); // Check again after 500ms
            }
          } catch (error) {
            console.error('Error parsing health check response:', error);
            setTimeout(checkHealth, 500); // Check again after 500ms
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('Error connecting to backend:', error.message);
        setTimeout(checkHealth, 500); // Check again after 500ms
      });
      
      req.end();
    };
    
    // Start checking
    checkHealth();
  });
}

/**
 * Creates the main application window
 */
function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false, // For security reasons
      contextIsolation: true, // For security reasons
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Reaper Control',
    icon: path.join(__dirname, 'frontend', 'static', 'favicon.png'),
    // Show a loading state until the content is loaded
    backgroundColor: '#1e1e1e',
    show: false
  });

  // Show window when ready to avoid blank screen
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Add event listeners to monitor frontend loading
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Frontend loaded successfully');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`Frontend failed to load: ${errorDescription} (${errorCode})`);
    
    // Check if the window still exists
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`
        document.body.innerHTML = '<div style="padding: 20px; font-family: Arial, sans-serif; color: #333;">' +
          '<h2 style="color: #e74c3c;">Frontend Loading Error</h2>' +
          '<p>The application frontend failed to load.</p>' +
          '<p>Error: ${errorDescription} (${errorCode})</p>' +
          '<p>Possible solutions:</p>' +
          '<ul>' +
          '<li>Check if the frontend build is complete and correct</li>' +
          '<li>Restart the application</li>' +
          '</ul>' +
          '<button onclick="window.location.reload()" ' +
          'style="padding: 8px 16px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">' +
          'Reload Frontend</button>' +
          '<button onclick="window.electronAPI.restartBackend()" ' +
          'style="padding: 8px 16px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">' +
          'Restart Backend</button>' +
          '</div>';
      `).catch(err => {
        console.error('Failed to execute JavaScript in webContents:', err);
      });
    }
  });

  // Load the frontend
  // In development, we'll load from the dev server
  // In production, we'll load from the built files
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    // In development, load from the dev server
    mainWindow.loadURL('http://localhost:5173');
    
    // Open DevTools in development mode
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from the built files
    mainWindow.loadURL(
      url.format({
        pathname: path.join(__dirname, 'frontend', 'build', 'index.html'),
        protocol: 'file:',
        slashes: true
      })
    );
  }

  // Set a timeout to check if the frontend has connected to the backend
  // If no connection status is reported within the timeout, show an error message
  let frontendConnectionTimeout = setTimeout(() => {
    console.log('Frontend connection timeout - no status reported within 15 seconds');
    
    // Check if the window still exists
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`
        if (document.body.innerHTML === '' || !window.socketConnected) {
          document.body.innerHTML = '<div style="padding: 20px; font-family: Arial, sans-serif; color: #333;">' +
            '<h2 style="color: #e74c3c;">Connection Timeout</h2>' +
            '<p>The application frontend failed to connect to the backend server within the expected time.</p>' +
            '<p>Possible solutions:</p>' +
            '<ul>' +
            '<li>Check if the backend server is running</li>' +
            '<li>Restart the application</li>' +
            '<li>Check network connectivity</li>' +
            '</ul>' +
            '<button onclick="window.electronAPI.restartBackend()" ' +
            'style="padding: 8px 16px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">' +
            'Restart Backend</button>' +
            '</div>';
        }
      `).catch(err => {
        console.error('Failed to execute JavaScript in webContents:', err);
      });
    }
  }, 15000); // 15 seconds timeout

  // Clear the timeout when a connection status is reported
  ipcMain.once('frontend-connection-status', () => {
    clearTimeout(frontendConnectionTimeout);
  });

  // Handle window close event
  mainWindow.on('closed', () => {
    mainWindow = null;
    
    // Clear the timeout if it's still active
    clearTimeout(frontendConnectionTimeout);
    
    // Kill the backend process when the window is closed
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
    }
  });
}

/**
 * Starts the backend server process
 */
function startBackendServer() {
  console.log('Starting backend server...');
  
  // Path to the backend server.js file
  const serverPath = path.join(__dirname, 'backend', 'server.js');
  
  // Spawn the backend process
  backendProcess = spawn('node', [serverPath], {
    env: { ...process.env, ELECTRON_RUN: 'true' }
  });
  
  // Log backend output
  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
  });
  
  backendProcess.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
  });
  
  backendProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
    backendProcess = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Start the backend server
  startBackendServer();
  
  // Wait for the backend server to be ready before creating the window
  console.log('Waiting for backend server to be ready...');
  await checkBackendReady();
  
  // Create the main window once the backend is ready
  console.log('Creating main window now that backend is ready');
  createWindow();
  
  // On macOS, recreate the window when the dock icon is clicked
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Make sure backend is ready before creating a new window
      await checkBackendReady();
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On macOS, quit the app when Command+Q is pressed
app.on('before-quit', () => {
  // Kill the backend process when the app is about to quit
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});

// Handle IPC messages from the renderer process
ipcMain.on('restart-backend', () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  
  startBackendServer();
});

// Handle frontend connection status reports
ipcMain.on('frontend-connection-status', (event, status) => {
  console.log('Frontend connection status:', status);
  
  if (!status.connected && (status.reason === 'connect_error' || status.reason === 'reconnect_failed')) {
    console.error('Frontend failed to connect to backend:', status.error || status.reason);
    
    // If the main window exists, show an error message
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`
        if (document.body.innerHTML === '') {
          document.body.innerHTML = '<div style="padding: 20px; font-family: Arial, sans-serif; color: #333;">' +
            '<h2 style="color: #e74c3c;">Connection Error</h2>' +
            '<p>The application failed to connect to the backend server.</p>' +
            '<p>Error: ${status.error || status.reason}</p>' +
            '<p>Possible solutions:</p>' +
            '<ul>' +
            '<li>Check if the backend server is running</li>' +
            '<li>Restart the application</li>' +
            '<li>Check network connectivity</li>' +
            '</ul>' +
            '<button onclick="window.electronAPI.restartBackend()" ' +
            'style="padding: 8px 16px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">' +
            'Restart Backend</button>' +
            '</div>';
        }
      `);
    }
  }
});