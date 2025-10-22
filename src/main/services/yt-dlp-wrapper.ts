import { spawn } from 'child_process'
import { ytdlpManager } from './ytdlp-manager'
import { BrowserWindow } from 'electron'

export interface DownloadOptions {
  url: string
  outputPath: string
  format?: string
  onProgress?: (progress: {
    percent: number
    speed: string
    eta: string
    size: string
  }) => void
  onComplete?: (filePath: string) => void
  onError?: (error: string) => void
}

export class YtDlpWrapper {
  private mainWindow: BrowserWindow | null = null

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  async downloadVideo(options: DownloadOptions): Promise<void> {
    const binaryPath = ytdlpManager.getBinaryPath()

    const args = [
      options.url,
      '-o', options.outputPath,
      '--newline', // Output progress on new lines
      '--no-part', // Don't use .part files
    ]

    if (options.format) {
      args.push('-f', options.format)
    }

    return new Promise((resolve, reject) => {
      const process = spawn(binaryPath, args)

      process.stdout.on('data', (data) => {
        const output = data.toString()
        console.log('yt-dlp output:', output)

        // Parse progress
        // Example: [download]  45.5% of 10.50MiB at 1.23MiB/s ETA 00:05
        const progressMatch = output.match(
          /\[download\]\s+(\d+\.?\d*)%\s+of\s+(\S+)\s+at\s+(\S+)\s+ETA\s+(\S+)/
        )

        if (progressMatch && options.onProgress) {
          const [, percent, size, speed, eta] = progressMatch
          options.onProgress({
            percent: parseFloat(percent),
            size,
            speed,
            eta,
          })
        }

        // Check if download is complete
        if (output.includes('[download] 100%') || output.includes('has already been downloaded')) {
          if (options.onComplete) {
            options.onComplete(options.outputPath)
          }
        }
      })

      process.stderr.on('data', (data) => {
        const error = data.toString()
        console.error('yt-dlp error:', error)
        if (options.onError) {
          options.onError(error)
        }
      })

      process.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`))
        }
      })

      process.on('error', (err) => {
        reject(err)
      })
    })
  }

  async getVideoInfo(url: string): Promise<any> {
    const binaryPath = ytdlpManager.getBinaryPath()

    return new Promise((resolve, reject) => {
      const args = [url, '-J'] // -J outputs JSON
      const process = spawn(binaryPath, args)

      let output = ''
      process.stdout.on('data', (data) => {
        output += data.toString()
      })

      process.on('close', (code) => {
        if (code === 0) {
          try {
            const info = JSON.parse(output)
            resolve(info)
          } catch (err) {
            reject(new Error('Failed to parse JSON output'))
          }
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`))
        }
      })
    })
  }

  async getFormats(url: string): Promise<any[]> {
    const info = await this.getVideoInfo(url)
    return info.formats || []
  }
}

export const ytdlpWrapper = new YtDlpWrapper()

