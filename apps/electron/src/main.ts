import * as path from "path";

import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  Notification,
  session,
  ipcMain,
  dialog,
  protocol,
} from "electron";
import { createIPCHandler } from "electron-trpc/main";
import registerListeners from "./helpers/ipc/listeners-register";
import { router } from "./api";
import { initializeDatabase } from "./api/db/init";
import { createContext } from "./api/trpc";
import { setWindowReferences } from "./api/routers/window";

import { logger } from "./helpers/logger";
import { initializeQueueManager } from "./services/download-queue/queue-manager";
import defaultDb from "./api/db";

import { toggleClockWindow } from "./main/windows/clock";


let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuiting: boolean = false;

/**
 * Get the tray instance
 * @returns The tray instance or null if not created yet
 */
export function getTray(): Tray | null {
  return tray;
}

/**
 * Show and focus the main window
 */
export function showMainWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }

  // Show the window if it's hidden
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  // Restore the window if it's minimized
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  // Bring the window to front and focus it
  mainWindow.focus();

  // Platform-specific window activation
  if (process.platform === "darwin") {
    // On macOS, use setAlwaysOnTop briefly to ensure it comes to front
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setAlwaysOnTop(false);
  } else if (process.platform === "win32") {
    // On Windows, use more aggressive focusing
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.moveTop();
  }
}

async function createTray() {
  // Request notification permission on macOS
  if (process.platform === "darwin") {
    await app.whenReady();
    if (!Notification.isSupported()) {
      logger.debug("Notifications not supported");
    }
  }

  // Get the correct path to the resources directory
  let iconPath: string;
  const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

  if (isDev) {
    // In development mode, use the root project directory
    const rootDir = path.resolve(path.join(__dirname, "..", ".."));
    iconPath =
      process.platform === "win32"
        ? path.join(rootDir, "resources", "icon.ico")
        : path.join(rootDir, "resources", "icon_16x16.png");
  } else {
    // In production mode
    if (process.platform === "darwin") {
      // For macOS, use the Contents/Resources directory
      iconPath = path.join(process.resourcesPath, "icon_16x16.png");
      logger.debug("Main: Using macOS production path:", iconPath);
    } else {
      // For Windows and other platforms
      iconPath = path.join(__dirname, "../resources/icon.ico");
    }
  }

  logger.debug("Main: Icon path", iconPath);

  // Check if file exists
  const fs = require("fs");
  if (fs.existsSync(iconPath)) {
    logger.debug("Main: Icon file exists at path", iconPath);
  } else {
    logger.error("Main: Icon file does not exist at path", iconPath);
    logger.debug("Main: __dirname value:", __dirname);
    logger.debug("Main: Resolved absolute path:", path.resolve(iconPath));

    // Try alternative paths for macOS
    if (process.platform === "darwin" && !isDev) {
      const altPaths = [
        path.join(process.resourcesPath, "resources", "icon_16x16.png"),
        path.join(app.getAppPath(), "resources", "icon_16x16.png"),
        path.join(__dirname, "../../resources/icon_16x16.png"),
      ];

      for (const altPath of altPaths) {
        logger.debug("Main: Trying alternative path:", altPath);
        if (fs.existsSync(altPath)) {
          iconPath = altPath;
          logger.debug("Main: Found icon at alternative path:", iconPath);
          break;
        }
      }
    }

    // List directory contents to debug
    try {
      const resourcesDir = path.dirname(iconPath);
      logger.debug("Main: Checking resources directory:", resourcesDir);
      const files = fs.readdirSync(resourcesDir);
      logger.debug("Main: Resources directory contents:", files);
    } catch (err) {
      logger.error("Main: Error reading resources directory:", err);
    }
  }

  const icon = nativeImage.createFromPath(iconPath);
  logger.debug("Main: Created nativeImage, isEmpty:", icon.isEmpty());

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show yt-dlp-gui",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "Toggle Clock",
      click: () => {
        toggleClockWindow();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip("yt-dlp-gui");

  tray.setTitle("");

  tray.on("click", () => {
    showMainWindow();
  });
}

function createWindow(): void {
  const preload = path.join(__dirname, "preload.js");

  const iconPath = path.join(__dirname, "../resources/icon.ico");
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    icon: iconPath,
    movable: true,
    webPreferences: {
      devTools: true,
      contextIsolation: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      preload,
    },
    // Apply different title bar styles based on the OS
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hidden" }
      : {
          frame: false, // Use frameless window on Windows
          titleBarStyle: "default", // Default title bar style for Windows
        }),
  });

  createIPCHandler({
    router,
    windows: [mainWindow],
    createContext,
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    // Open DevTools automatically in development
    mainWindow.webContents.openDevTools();
  } else {
    const mainPath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
    logger.info("Main: Loading main window from:", mainPath);
    logger.info("Main: MAIN_WINDOW_VITE_NAME:", MAIN_WINDOW_VITE_NAME);
    mainWindow.loadFile(mainPath);
  }

  // Set up window references for tRPC window router
  setWindowReferences(mainWindow, tray);

  // Register other IPC listeners (excluding window listeners)
  registerListeners(mainWindow, tray);


  mainWindow.on("close", (event) => {
    if (!isQuiting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

// Ensure single instance - prevent multiple app instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit();
} else {
  // This is the first instance, handle second instance events
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();

      // On Windows, bring to front more aggressively
      if (process.platform === "win32") {
        mainWindow.setAlwaysOnTop(true);
        mainWindow.setAlwaysOnTop(false);
      }
    } else {
      // If no window exists, create one
      createWindow();
    }
  });
}

// Initialize app when ready
app.whenReady().then(async () => {
  try {
    logger.clearLogFile();
    await initializeDatabase();

    // Initialize download queue manager
    logger.info("[app] Initializing download queue manager");
    initializeQueueManager(defaultDb, { autoStart: true });
    logger.info("[app] Download queue manager initialized");
  } catch (error) {
    logger.error("[app.whenReady] Failed to initialize database:", error);
  }


  await createTray();
  createWindow();


  // Modify CSP to allow scripts from PostHog and inline scripts
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' https://*.posthog.com; " +
            "connect-src 'self' https://*.posthog.com; " +
            "img-src 'self' data: file: local-file: https://*.posthog.com https://i.ytimg.com https://*.ytimg.com https://yt3.ggpht.com; " +
            "media-src 'self' file: local-file:; " +
            "style-src 'self' 'unsafe-inline'; " +
            "frame-src 'self';",
        ],
      },
    });
  });

  // Filter and block specific PostHog requests that are not needed
  session.defaultSession.webRequest.onBeforeRequest(
    {
      urls: [
        "https://*.posthog.com/static/surveys.js*",
        "https://*.posthog.com/static/toolbar.js*",
        "https://*.posthog.com/static/recorder.js*",
      ],
    },
    (details, callback) => {
      // Block these specific requests
      callback({ cancel: true });
    }
  );

  // Register custom protocol to safely load local files from http(s) pages (dev server)
  protocol.registerFileProtocol("local-file", (request, callback) => {
    try {
      // request.url example: local-file:///absolute/path/to/file.mp4
      const url = decodeURIComponent(request.url.replace("local-file://", ""));
      callback({ path: url });
    } catch (e) {
      logger.error("[protocol] Failed to resolve local-file URL", e as Error);
      callback({ error: -2 }); // FILE_NOT_FOUND
    }
  });
});

// Handle app quit
app.on("before-quit", () => {
  isQuiting = true;
});

//osX only
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    showMainWindow();
  }
});
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

export {};

//osX only ends
// This allows TypeScript to pick up the magic constants that's auto-generated by Forge's Vite
// plugin that tells the Electron app where to look for the Vite-bundled app code (depending on
// whether you're running in development or production).
export declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
export declare const MAIN_WINDOW_VITE_NAME: string;
// Preload types
interface ThemeModeContext {
  toggle: () => Promise<boolean>;
  dark: () => Promise<void>;
  light: () => Promise<void>;
  system: () => Promise<boolean>;
  current: () => Promise<"dark" | "light" | "system">;
}

declare global {
  interface Window {
    themeMode: ThemeModeContext;
    electronNotification?: {
      send: (data: any) => Promise<void>;
      close: () => Promise<void>;
      action: () => Promise<void>;
      onNotification: (callback: (data: any) => void) => void;
    };
    ytdlp?: {
      isInstalled: () => Promise<boolean>;
      getVersion: () => Promise<string | null>;
      checkUpdates: () => Promise<{ hasUpdate: boolean; latestVersion: string | null }>;
      download: () => Promise<{ success: boolean }>;
      update: () => Promise<{ success: boolean }>;
      getPath: () => Promise<string>;
      onDownloadStarted: (callback: () => void) => void;
      onDownloadProgress: (callback: (progress: {
        downloaded: number;
        total: number;
        percentage: number;
      }) => void) => void;
      onDownloadCompleted: (callback: (version: string) => void) => void;
      onDownloadFailed: (callback: (error: string) => void) => void;
      onUpdateAvailable: (callback: (version: string) => void) => void;
    };
  }
}
