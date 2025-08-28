/// <reference path="../../../forge.env.d.ts" />
import { BrowserWindow, screen } from "electron";
import path from "path";

let blockingNotificationWindow: BrowserWindow | null = null;

export function createBlockingNotificationWindow(): BrowserWindow {
  // Don't create multiple blocking notification windows
  if (blockingNotificationWindow && !blockingNotificationWindow.isDestroyed()) {
    blockingNotificationWindow.focus();
    return blockingNotificationWindow;
  }

  const preload = path.join(__dirname, "./preload/blocking-notification.js");

  // Get the current mouse position to determine active screen
  const mousePoint = screen.getCursorScreenPoint();
  const currentDisplay = screen.getDisplayNearestPoint(mousePoint);
  const { width, height } = currentDisplay.workAreaSize;

  blockingNotificationWindow = new BrowserWindow({
    width,
    height,
    frame: true, // Changed to true to show window controls
    transparent: false,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true, // Allow resizing for better usability
    movable: true, // Allow moving the window
    minimizable: true,
    maximizable: true,
    closable: true,
    focusable: true,
    show: false,
    webPreferences: {
      preload: preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
    vibrancy: "under-window", // macOS vibrancy effect
    visualEffectState: "active",
  });

  // Set window to be always on top with highest level
  blockingNotificationWindow.setAlwaysOnTop(true, "screen-saver");
  blockingNotificationWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Set window bounds to cover current display
  blockingNotificationWindow.setBounds(currentDisplay.bounds);

  // Load the blocking notification app
  if (BLOCKING_NOTIFICATION_WINDOW_VITE_DEV_SERVER_URL) {
    blockingNotificationWindow.loadURL(BLOCKING_NOTIFICATION_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    blockingNotificationWindow.loadFile(
      path.join(__dirname, `../renderer/${BLOCKING_NOTIFICATION_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Register an escape key handler
  blockingNotificationWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      blockingNotificationWindow?.webContents.send("trigger-close");
    }
  });

  // Handle close event to ensure proper cleanup
  blockingNotificationWindow.on("close", (event) => {
    // Trigger close channel to handle response if needed
    blockingNotificationWindow?.webContents.send("trigger-close");
  });

  blockingNotificationWindow.on("closed", () => {
    blockingNotificationWindow = null;
  });

  // Open DevTools for debugging in development
  if (process.env.NODE_ENV === "development") {
    blockingNotificationWindow.webContents.openDevTools();
  }

  return blockingNotificationWindow;
}

export function getBlockingNotificationWindow(): BrowserWindow | null {
  return blockingNotificationWindow;
}

export function closeBlockingNotificationWindow(): void {
  if (blockingNotificationWindow && !blockingNotificationWindow.isDestroyed()) {
    blockingNotificationWindow.close();
    blockingNotificationWindow = null;
  }
}
