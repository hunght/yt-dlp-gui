import { ipcMain } from 'electron'
import { ytdlpManager } from '../services/ytdlp-manager'

export function registerYtDlpHandlers() {
  // Check if yt-dlp is installed
  ipcMain.handle('ytdlp:is-installed', () => {
    return ytdlpManager.isInstalled()
  })

  // Get current version
  ipcMain.handle('ytdlp:get-version', async () => {
    return await ytdlpManager.getCurrentVersion()
  })

  // Check for updates
  ipcMain.handle('ytdlp:check-updates', async () => {
    return await ytdlpManager.checkForUpdates()
  })

  // Download yt-dlp
  ipcMain.handle('ytdlp:download', async () => {
    await ytdlpManager.download()
    return { success: true }
  })

  // Update yt-dlp
  ipcMain.handle('ytdlp:update', async () => {
    await ytdlpManager.download()
    return { success: true }
  })

  // Get binary path
  ipcMain.handle('ytdlp:get-path', () => {
    return ytdlpManager.getBinaryPath()
  })
}

