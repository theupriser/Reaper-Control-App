import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// Import services
import { ReaperConnector } from './services/reaperConnector'
import { RegionService } from './services/regionService'
import { MarkerService } from './services/markerService'
import { MidiService } from './services/midiService'
import { ProjectService } from './services/projectService'
import { SystemStatsService } from './services/systemStatsService'
import { IpcHandler } from './ipc/ipcHandler'
import logger, { setLoggerContext } from './utils/logger'


// Global references
let mainWindow: BrowserWindow | null = null

// Track DevTools state
let isDevToolsOpen = false

// Service instances
let reaperConnector: ReaperConnector | null = null
let regionService: RegionService | null = null
let markerService: MarkerService | null = null
let midiService: MidiService | null = null
let projectService: ProjectService | null = null
let systemStatsService: SystemStatsService | null = null
let ipcHandler: IpcHandler | null = null

/**
 * Function to check if DevTools are currently open
 * @returns True if DevTools are open, false otherwise
 */
function areDevToolsOpen(): boolean {
  return isDevToolsOpen;
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
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

      // Set up logger with mainWindow and DevTools state check
      setLoggerContext(mainWindow, areDevToolsOpen);

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

    // Setup DevTools state tracking
    mainWindow.webContents.on('devtools-opened', () => {
      isDevToolsOpen = true;
      logger.info('DevTools opened');
    });

    mainWindow.webContents.on('devtools-closed', () => {
      isDevToolsOpen = false;
      logger.info('DevTools closed');
    });

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
      // DevTools will be opened, but the event might fire later,
      // so we'll set the flag now
      isDevToolsOpen = true;
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
  if (!mainWindow) return

  // Create and start the system stats service if it doesn't exist
  if (!systemStatsService) {
    systemStatsService = new SystemStatsService(mainWindow, 2000, reaperConnector || undefined)
  }

  // Start the monitoring service
  systemStatsService.start()
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
  if (systemStatsService) {
    systemStatsService.cleanup()
    systemStatsService = null
  }

  regionService = null
  markerService = null
  projectService = null

  // Set mainWindow to null to prevent further access
  mainWindow = null

  logger.info('Application shutting down')
  app.quit();
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
