import { app, BrowserWindow } from 'electron'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const writeFile = promisify(fs.writeFile)
const chmod = promisify(fs.chmod)
const unlink = promisify(fs.unlink)

interface DownloadProgress {
  downloaded: number
  total: number
  percentage: number
}

export class YtDlpManager {
  private binaryPath: string
  private versionFilePath: string
  private mainWindow: BrowserWindow | null = null

  constructor() {
    const userDataPath = app.getPath('userData')
    const binDir = path.join(userDataPath, 'bin')

    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true })
    }

    const binaryName = this.getBinaryName()
    this.binaryPath = path.join(binDir, binaryName)
    this.versionFilePath = path.join(binDir, 'yt-dlp-version.txt')
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  private getBinaryName(): string {
    switch (process.platform) {
      case 'win32':
        return 'yt-dlp.exe'
      case 'darwin':
        return 'yt-dlp'
      case 'linux':
        return 'yt-dlp'
      default:
        throw new Error(`Unsupported platform: ${process.platform}`)
    }
  }

  private getBinaryUrl(): string {
    const baseUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'
    switch (process.platform) {
      case 'win32':
        return `${baseUrl}/yt-dlp.exe`
      case 'darwin':
        return `${baseUrl}/yt-dlp_macos`
      case 'linux':
        return `${baseUrl}/yt-dlp`
      default:
        throw new Error(`Unsupported platform: ${process.platform}`)
    }
  }

  getBinaryPath(): string {
    return this.binaryPath
  }

  isInstalled(): boolean {
    return fs.existsSync(this.binaryPath)
  }

  async getCurrentVersion(): Promise<string | null> {
    try {
      if (fs.existsSync(this.versionFilePath)) {
        return fs.readFileSync(this.versionFilePath, 'utf-8').trim()
      }
    } catch (err) {
      console.error('Failed to read version file:', err)
    }
    return null
  }

  private async saveVersion(version: string): Promise<void> {
    try {
      await writeFile(this.versionFilePath, version, 'utf-8')
    } catch (err) {
      console.error('Failed to save version:', err)
    }
  }

  async checkForUpdates(): Promise<{ hasUpdate: boolean; latestVersion: string | null }> {
    try {
      const latestVersion = await this.getLatestVersion()
      const currentVersion = await this.getCurrentVersion()

      if (!currentVersion) {
        return { hasUpdate: true, latestVersion }
      }

      return {
        hasUpdate: latestVersion !== currentVersion,
        latestVersion,
      }
    } catch (err) {
      console.error('Failed to check for updates:', err)
      return { hasUpdate: false, latestVersion: null }
    }
  }

  private async getLatestVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      https.get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
        headers: {
          'User-Agent': 'yt-dlp-gui',
        },
      }, (response) => {
        let data = ''
        response.on('data', (chunk) => {
          data += chunk
        })
        response.on('end', () => {
          try {
            const release = JSON.parse(data)
            resolve(release.tag_name)
          } catch (err) {
            reject(err)
          }
        })
      }).on('error', reject)
    })
  }

  async download(onProgress?: (progress: DownloadProgress) => void): Promise<void> {
    const url = this.getBinaryUrl()
    const tempPath = `${this.binaryPath}.tmp`

    try {
      // Send initial progress
      if (this.mainWindow) {
        this.mainWindow.webContents.send('ytdlp:download-started')
      }

      await this.downloadFile(url, tempPath, onProgress)

      // Remove old binary if exists
      if (fs.existsSync(this.binaryPath)) {
        await unlink(this.binaryPath)
      }

      // Move temp file to final location
      fs.renameSync(tempPath, this.binaryPath)

      // Make executable on Unix systems
      if (process.platform !== 'win32') {
        await chmod(this.binaryPath, 0o755)
      }

      // Save version
      const version = await this.getLatestVersion()
      await this.saveVersion(version)

      if (this.mainWindow) {
        this.mainWindow.webContents.send('ytdlp:download-completed', version)
      }
    } catch (err) {
      // Clean up temp file on error
      if (fs.existsSync(tempPath)) {
        await unlink(tempPath)
      }

      if (this.mainWindow) {
        this.mainWindow.webContents.send('ytdlp:download-failed', (err as Error).message)
      }
      throw err
    }
  }

  private async downloadFile(
    url: string,
    outputPath: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'User-Agent': 'yt-dlp-gui',
        },
      }, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            this.downloadFile(redirectUrl, outputPath, onProgress)
              .then(resolve)
              .catch(reject)
            return
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`))
          return
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10)
        let downloadedSize = 0

        const file = fs.createWriteStream(outputPath)

        response.on('data', (chunk) => {
          downloadedSize += chunk.length
          const percentage = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0

          if (onProgress) {
            onProgress({
              downloaded: downloadedSize,
              total: totalSize,
              percentage,
            })
          }

          if (this.mainWindow) {
            this.mainWindow.webContents.send('ytdlp:download-progress', {
              downloaded: downloadedSize,
              total: totalSize,
              percentage,
            })
          }
        })

        response.pipe(file)

        file.on('finish', () => {
          file.close()
          resolve()
        })

        file.on('error', (err) => {
          fs.unlink(outputPath, () => {})
          reject(err)
        })
      }).on('error', (err) => {
        reject(err)
      })
    })
  }

  async ensureInstalled(): Promise<void> {
    if (!this.isInstalled()) {
      console.log('yt-dlp not found, downloading...')
      await this.download()
    } else {
      console.log('yt-dlp already installed')
      // Check for updates in background (non-blocking)
      this.checkForUpdates().then(({ hasUpdate, latestVersion }) => {
        if (hasUpdate && this.mainWindow) {
          this.mainWindow.webContents.send('ytdlp:update-available', latestVersion)
        }
      }).catch(err => {
        console.error('Failed to check for updates:', err)
      })
    }
  }
}

export const ytdlpManager = new YtDlpManager()

