import { contextBridge, ipcRenderer } from 'electron'

export interface YtDlpProgress {
  downloaded: number
  total: number
  percentage: number
}

export interface YtDlpUpdateInfo {
  hasUpdate: boolean
  latestVersion: string | null
}

export interface YtDlpContext {
  isInstalled: () => Promise<boolean>
  getVersion: () => Promise<string | null>
  checkUpdates: () => Promise<YtDlpUpdateInfo>
  download: () => Promise<{ success: boolean }>
  update: () => Promise<{ success: boolean }>
  getPath: () => Promise<string>
  onDownloadStarted: (callback: () => void) => void
  onDownloadProgress: (callback: (progress: YtDlpProgress) => void) => void
  onDownloadCompleted: (callback: (version: string) => void) => void
  onDownloadFailed: (callback: (error: string) => void) => void
  onUpdateAvailable: (callback: (version: string) => void) => void
}

export function exposeYtDlpContext() {
  const ytdlpContext: YtDlpContext = {
    isInstalled: () => ipcRenderer.invoke('ytdlp:is-installed'),
    getVersion: () => ipcRenderer.invoke('ytdlp:get-version'),
    checkUpdates: () => ipcRenderer.invoke('ytdlp:check-updates'),
    download: () => ipcRenderer.invoke('ytdlp:download'),
    update: () => ipcRenderer.invoke('ytdlp:update'),
    getPath: () => ipcRenderer.invoke('ytdlp:get-path'),
    onDownloadStarted: (callback) => {
      ipcRenderer.on('ytdlp:download-started', () => callback())
    },
    onDownloadProgress: (callback) => {
      ipcRenderer.on('ytdlp:download-progress', (_, progress) => callback(progress))
    },
    onDownloadCompleted: (callback) => {
      ipcRenderer.on('ytdlp:download-completed', (_, version) => callback(version))
    },
    onDownloadFailed: (callback) => {
      ipcRenderer.on('ytdlp:download-failed', (_, error) => callback(error))
    },
    onUpdateAvailable: (callback) => {
      ipcRenderer.on('ytdlp:update-available', (_, version) => callback(version))
    },
  }

  contextBridge.exposeInMainWorld('ytdlp', ytdlpContext)
}

