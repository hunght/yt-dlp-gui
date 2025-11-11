import { ipcMain } from "electron";
import { logger } from "../logger";

const registeredListeners = new Set<string>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safelyRegisterListener(channel: string, handler: (...args: any[]) => any) {
  if (registeredListeners.has(channel)) {
    ipcMain.removeHandler(channel);
  }
  logger.debug(`Registering listener for channel ${channel}`);
  ipcMain.handle(channel, handler);
  registeredListeners.add(channel);
}

// cleanupListeners removed - unused
