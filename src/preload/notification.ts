import { contextBridge, ipcRenderer } from "electron";
import {
  NOTIFICATION_CLOSE_CHANNEL,
  NOTIFICATION_ACTION_CHANNEL,
  NOTIFICATION_SHOW_CHANNEL,
  NOTIFICATION_EXTEND_SESSION_CHANNEL,
} from "../helpers/ipc/notification/notification-channels";

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld("electronNotification", {
  // Function to close the notification window
  close: async () => {
    try {
      await ipcRenderer.invoke(NOTIFICATION_CLOSE_CHANNEL);
    } catch (error) {
      // Silently handle errors
    }
  },

  // Function to handle notification action
  action: () => {
    ipcRenderer.invoke(NOTIFICATION_ACTION_CHANNEL);
  },

  // Function to extend session
  extendSession: (minutesToAdd: number) => {
    return ipcRenderer.invoke(NOTIFICATION_EXTEND_SESSION_CHANNEL, { minutesToAdd });
  },

  // Function to listen for show-notification events
  onNotification: (callback: (data: unknown) => void) => {
    ipcRenderer.on(NOTIFICATION_SHOW_CHANNEL, (_event, data) => {
      callback(data);
    });
  },
});
