import type { ContextBridge, IpcRenderer } from "electron";
import {
  THEME_MODE_CURRENT_CHANNEL,
  THEME_MODE_DARK_CHANNEL,
  THEME_MODE_LIGHT_CHANNEL,
  THEME_MODE_SYSTEM_CHANNEL,
  THEME_MODE_TOGGLE_CHANNEL,
} from "./theme-channels";

export function exposeThemeContext() {
  // In preload scripts, require is synchronous and properly typed
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const { contextBridge, ipcRenderer } = require("electron") as {
    contextBridge: ContextBridge;
    ipcRenderer: IpcRenderer;
  };

  contextBridge.exposeInMainWorld("themeMode", {
    current: () => ipcRenderer.invoke(THEME_MODE_CURRENT_CHANNEL),
    toggle: () => ipcRenderer.invoke(THEME_MODE_TOGGLE_CHANNEL),
    dark: () => ipcRenderer.invoke(THEME_MODE_DARK_CHANNEL),
    light: () => ipcRenderer.invoke(THEME_MODE_LIGHT_CHANNEL),
    system: () => ipcRenderer.invoke(THEME_MODE_SYSTEM_CHANNEL),
  });
}
