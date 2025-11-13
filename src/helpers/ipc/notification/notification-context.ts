import { contextBridge, ipcRenderer } from "electron";
import {
  NOTIFICATION_SEND_CHANNEL,
  NOTIFICATION_CLOSE_CHANNEL,
  NOTIFICATION_ACTION_CHANNEL,
  NOTIFICATION_SHOW_CHANNEL,
} from "./notification-channels";
import { NotificationData } from "@/helpers/notification/notification-window-utils";

export function exposeNotificationContext(): void {
  contextBridge.exposeInMainWorld("electronNotification", {
    // Function to send a notification
    send: (data: NotificationData) => {
      return ipcRenderer.invoke(NOTIFICATION_SEND_CHANNEL, data);
    },

    // Function to close the notification window
    close: () => {
      return ipcRenderer.invoke(NOTIFICATION_CLOSE_CHANNEL);
    },

    // Function to handle notification action
    action: () => {
      return ipcRenderer.invoke(NOTIFICATION_ACTION_CHANNEL);
    },

    // Function to listen for show-notification events
    onNotification: (callback: (data: NotificationData) => void) => {
      ipcRenderer.on(NOTIFICATION_SHOW_CHANNEL, (_event, data) => {
        callback(data);
      });
    },
  });
}
