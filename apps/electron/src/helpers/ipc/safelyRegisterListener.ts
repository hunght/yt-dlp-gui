import { ipcMain } from "electron";
import { logger } from "../logger";

const registeredListeners = new Set<string>();

export function safelyRegisterListener(channel: string, handler: (...args: unknown[]) => unknown) {
  if (registeredListeners.has(channel)) {
    ipcMain.removeHandler(channel);
  }
  logger.debug(`Registering listener for channel ${channel}`);
  ipcMain.handle(channel, handler);
  registeredListeners.add(channel);
}

// cleanupListeners removed - unused
