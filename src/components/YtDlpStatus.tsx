import { useState, useEffect } from 'react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface YtDlpStatusProps {
  showDetails?: boolean
}

export function YtDlpStatus({ showDetails = true }: YtDlpStatusProps) {
  const [isInstalled, setIsInstalled] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [version, setVersion] = useState<string | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    checkInstallation()

    // Listen for download events
    if (window.ytdlp) {
      window.ytdlp.onDownloadStarted(() => {
        setIsDownloading(true)
        setDownloadProgress(0)
        setError(null)
      })

      window.ytdlp.onDownloadProgress((progress) => {
        setDownloadProgress(progress.percentage)
      })

      window.ytdlp.onDownloadCompleted((newVersion) => {
        setIsDownloading(false)
        setIsInstalled(true)
        setVersion(newVersion)
        setUpdateAvailable(null)
      })

      window.ytdlp.onDownloadFailed((errorMessage) => {
        setIsDownloading(false)
        setError(errorMessage)
      })

      window.ytdlp.onUpdateAvailable((latestVersion) => {
        setUpdateAvailable(latestVersion)
      })
    }
  }, [])

  const checkInstallation = async () => {
    if (!window.ytdlp) return

    setIsChecking(true)
    try {
      const installed = await window.ytdlp.isInstalled()
      setIsInstalled(installed)

      if (installed) {
        const currentVersion = await window.ytdlp.getVersion()
        setVersion(currentVersion)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check installation')
    } finally {
      setIsChecking(false)
    }
  }

  const handleDownload = async () => {
    if (!window.ytdlp) return

    try {
      setError(null)
      await window.ytdlp.download()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    }
  }

  const handleUpdate = async () => {
    if (!window.ytdlp) return

    try {
      setError(null)
      await window.ytdlp.update()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  if (!showDetails && isInstalled && !updateAvailable && !isDownloading) {
    return null
  }

  if (isChecking) {
    return (
      <Alert>
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertTitle>Checking yt-dlp status...</AlertTitle>
      </Alert>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (isDownloading) {
    return (
      <Alert>
        <Download className="h-4 w-4 animate-pulse" />
        <AlertTitle>Downloading yt-dlp...</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>Please wait while yt-dlp is being downloaded.</p>
          <Progress value={downloadProgress} className="w-full" />
          <p className="text-sm text-muted-foreground">{downloadProgress.toFixed(1)}%</p>
        </AlertDescription>
      </Alert>
    )
  }

  if (!isInstalled) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>yt-dlp Not Found</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>yt-dlp is required but not installed.</p>
          <Button onClick={handleDownload} size="sm">
            <Download className="mr-2 h-4 w-4" />
            Download yt-dlp
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (updateAvailable) {
    return (
      <Alert>
        <Download className="h-4 w-4" />
        <AlertTitle>Update Available</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            A new version of yt-dlp is available: {updateAvailable}
            {version && ` (current: ${version})`}
          </p>
          <Button onClick={handleUpdate} size="sm" variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Update Now
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (showDetails) {
    return (
      <Alert>
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertTitle>yt-dlp Ready</AlertTitle>
        <AlertDescription>
          {version ? `Version ${version} is installed` : 'yt-dlp is installed and ready'}
        </AlertDescription>
      </Alert>
    )
  }

  return null
}

