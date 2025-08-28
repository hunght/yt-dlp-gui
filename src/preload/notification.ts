import { contextBridge, ipcRenderer } from "electron";
import {
  NOTIFICATION_SEND_CHANNEL,
  NOTIFICATION_CLOSE_CHANNEL,
  NOTIFICATION_ACTION_CHANNEL,
  NOTIFICATION_SHOW_CHANNEL,
} from "../helpers/ipc/notification/notification-channels";

// Add debug logging to preload script

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld("electronNotification", {
  // Function to close the notification window
  close: async () => {
    try {
      await ipcRenderer.invoke(NOTIFICATION_CLOSE_CHANNEL);
    } catch (error) {
      console.error("Failed to close notification:", error);
    }
  },

  // Function to handle notification action
  action: () => {
    ipcRenderer.invoke(NOTIFICATION_ACTION_CHANNEL);
  },

  // Function to listen for show-notification events
  onNotification: (callback: (data: any) => void) => {
    ipcRenderer.on(NOTIFICATION_SHOW_CHANNEL, (_event, data) => {
      callback(data);
    });
  },
});
