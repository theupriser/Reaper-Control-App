import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import os from 'os'

// Import services
import { ReaperConnector } from './services/reaperConnector'
import { RegionService } from './services/regionService'
import { MarkerService } from './services/markerService'
import { MidiService } from './services/midiService'
import { ProjectService } from './services/projectService'
import { IpcHandler } from './ipc/ipcHandler'
import logger from './utils/logger'


// Global references
let mainWindow: BrowserWindow | null = null
let systemStatsInterval: NodeJS.Timeout | null = null

// Service instances
let reaperConnector: ReaperConnector | null = null
let regionService: RegionService | null = null
let markerService: MarkerService | null = null
let midiService: MidiService | null = null
let projectService: ProjectService | null = null
let ipcHandler: IpcHandler | null = null

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'Reaper Control',
    icon, // Use the icon for all platforms, not just Linux
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show()

      // Initialize services
      initializeServices()

      // Start system stats monitoring
      startSystemStatsMonitoring()
    }
  })

  if (mainWindow) {
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
  }

}

/**
 * Initialize services
 */
function initializeServices(): void {
  if (!mainWindow) {
    logger.error('Cannot initialize services: mainWindow is null');
    return;
  }

  try {
    logger.info('Initializing services...');

    // Initialize REAPER connector
    reaperConnector = new ReaperConnector();

    // Initialize services
    markerService = new MarkerService(reaperConnector);
    regionService = new RegionService(reaperConnector, markerService);
    midiService = new MidiService();
    projectService = new ProjectService(reaperConnector);

    // Set the project service in the region service for setlist navigation
    regionService.setProjectService(projectService);

    // Initialize IPC handler
    ipcHandler = new IpcHandler(
      mainWindow,
      reaperConnector,
      regionService,
      markerService,
      midiService,
      projectService
    );

    // Connect to REAPER
    reaperConnector.connect();

    logger.info('Services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services', { error });
  }
}

/**
 * Start monitoring system stats and send updates to the renderer process
 */
function startSystemStatsMonitoring(): void {
  // Clear any existing interval
  if (systemStatsInterval) {
    clearInterval(systemStatsInterval)
    systemStatsInterval = null
  }

  // Send system stats every 2 seconds
  systemStatsInterval = setInterval(() => {
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

    if (mainWindow) {
      mainWindow.webContents.send('system-stats', stats)
    }
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
  // Clean up services
  if (ipcHandler) {
    ipcHandler.cleanup()
    ipcHandler = null
  }

  if (reaperConnector) {
    reaperConnector.cleanup()
    reaperConnector = null
  }

  if (midiService) {
    midiService.cleanup()
    midiService = null
  }

  // Clean up other services
  regionService = null
  markerService = null
  projectService = null

  // Clean up system stats monitoring interval
  if (systemStatsInterval) {
    clearInterval(systemStatsInterval)
    systemStatsInterval = null
  }

  // Set mainWindow to null to prevent further access
  mainWindow = null

  logger.info('Application shutting down')
  app.quit();
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
