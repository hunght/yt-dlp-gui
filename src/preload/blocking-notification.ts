import { contextBridge, ipcRenderer } from "electron";

// Blocking notification specific channels
const BLOCKING_NOTIFICATION_SHOW_CHANNEL = "show-blocking-notification";
const BLOCKING_NOTIFICATION_RESPOND_CHANNEL = "blocking-notification-respond";
const BLOCKING_NOTIFICATION_CLOSE_CHANNEL = "close-blocking-notification";

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld("electronBlockingNotification", {
  // Function to handle notification response
  respond: (response: number) => {
    return ipcRenderer.invoke(BLOCKING_NOTIFICATION_RESPOND_CHANNEL, response);
  },

  // Function to explicitly close the notification window
  close: () => {
    return ipcRenderer.invoke(BLOCKING_NOTIFICATION_CLOSE_CHANNEL);
  },

  // Function to listen for show-blocking-notification events
  onNotification: (callback: (data: any) => void) => {
    ipcRenderer.on(BLOCKING_NOTIFICATION_SHOW_CHANNEL, (_event, data) => {
      callback(data);
    });

    // Also listen for trigger-close events from the main process
    ipcRenderer.on("trigger-close", () => {
      ipcRenderer.invoke(BLOCKING_NOTIFICATION_CLOSE_CHANNEL).catch((err) => {
        console.error("Error handling trigger-close:", err);
      });
    });
  },
});
