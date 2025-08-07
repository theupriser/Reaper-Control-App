import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { backendService } from './backend/backendService'
import os from 'os'

// Global reference to the main window
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()

    // Initialize the backend service
    backendService.initialize(mainWindow)

    // Start system stats monitoring
    startSystemStatsMonitoring()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open DevTools in development mode
  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }

  // Set up IPC handlers
  setupIpcHandlers()
}

/**
 * Set up IPC handlers for communication with the renderer process
 */
function setupIpcHandlers(): void {
  // Ping/Pong for latency measurement
  ipcMain.handle('ping', async (): Promise<string> => {
    return 'pong'
  })

  // Connection status reporting
  ipcMain.on('report-connection-status', (_, status) => {
    console.log('Connection status reported:', status)
  })

  // Request reconnection
  ipcMain.on('request-reconnect', () => {
    console.log('Reconnection requested')
    // In a real implementation, this would trigger a reconnection to REAPER
  })

  // Regions management
  ipcMain.handle('refresh-regions', async () => {
    return await backendService.refreshRegions()
  })

  ipcMain.handle('get-regions', async () => {
    return await backendService.getRegions()
  })

  // Markers management
  ipcMain.handle('refresh-markers', async () => {
    return await backendService.refreshMarkers()
  })

  // Playback control
  ipcMain.handle('toggle-play', async () => {
    return await backendService.togglePlay()
  })

  ipcMain.handle('seek-to-position', async (_, position) => {
    return await backendService.seekToPosition(position)
  })

  ipcMain.handle('seek-to-region', async (_, regionId) => {
    return await backendService.seekToRegion(regionId)
  })

  ipcMain.handle('next-region', async () => {
    return await backendService.nextRegion()
  })

  ipcMain.handle('previous-region', async () => {
    return await backendService.previousRegion()
  })

  ipcMain.handle('seek-to-current-region-start', async () => {
    return await backendService.seekToCurrentRegionStart()
  })

  // Project management
  ipcMain.handle('refresh-project-id', async () => {
    return await backendService.refreshProjectId()
  })

  ipcMain.handle('get-project-id', async () => {
    return await backendService.getProjectId()
  })

  // Setlist management
  ipcMain.handle('set-selected-setlist', async (_, setlistId) => {
    return await backendService.setSelectedSetlist(setlistId)
  })

  ipcMain.handle('get-setlists', async () => {
    return await backendService.getSetlists()
  })

  ipcMain.handle('get-setlist', async (_, setlistId) => {
    return await backendService.getSetlist(setlistId)
  })

  ipcMain.handle('create-setlist', async (_, name) => {
    return await backendService.createSetlist(name)
  })

  ipcMain.handle('update-setlist', async (_, { setlistId, name }) => {
    return await backendService.updateSetlist(setlistId, name)
  })

  ipcMain.handle('delete-setlist', async (_, setlistId) => {
    return await backendService.deleteSetlist(setlistId)
  })

  ipcMain.handle('add-setlist-item', async (_, { setlistId, regionId, position }) => {
    return await backendService.addSetlistItem(setlistId, regionId, position)
  })

  ipcMain.handle('remove-setlist-item', async (_, { setlistId, itemId }) => {
    return await backendService.removeSetlistItem(setlistId, itemId)
  })

  ipcMain.handle('move-setlist-item', async (_, { setlistId, itemId, newPosition }) => {
    return await backendService.moveSetlistItem(setlistId, itemId, newPosition)
  })
}

/**
 * Start monitoring system stats and send updates to the renderer process
 */
function startSystemStatsMonitoring(): void {
  // Send system stats every 2 seconds
  setInterval(() => {
    if (!mainWindow) return

    const cpuInfo = os.cpus()
    const totalMem = os.totalmem()
    const freeMem = os.freemem()

    const stats = {
      cpu: {
        usage: Math.round(Math.random() * 50), // Mock CPU usage
        cores: cpuInfo.length,
        speed: Math.round(cpuInfo[0].speed / 100) / 10 // GHz
      },
      memory: {
        total: totalMem,
        used: totalMem - freeMem,
        free: freeMem,
        usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100)
      },
      lastUpdated: Date.now()
    }

    mainWindow.webContents.send('system-stats', stats)
  }, 2000)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.reaper-control')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // Clean up backend service
  if (backendService) {
    backendService.cleanup()
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
