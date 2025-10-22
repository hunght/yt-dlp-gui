# yt-dlp Binary Integration Guide

## Overview

This document describes how yt-dlp binary integration works in the application, including automatic downloads, updates, and usage.

## Architecture

```
┌─────────────────┐
│   Renderer      │
│   (React UI)    │
└────────┬────────┘
         │ window.ytdlp
         │
┌────────▼────────┐
│   Preload       │
│   (IPC Bridge)  │
└────────┬────────┘
         │ IPC
         │
┌────────▼────────┐
│   Main Process  │
│                 │
│ ┌─────────────┐ │
│ │ YtDlpManager│ │  ← Downloads & manages binary
│ └─────────────┘ │
│                 │
│ ┌─────────────┐ │
│ │YtDlpWrapper │ │  ← Executes yt-dlp commands
│ └─────────────┘ │
└─────────────────┘
```

## File Structure

```
src/
├── main/
│   ├── services/
│   │   ├── ytdlp-manager.ts    # Binary download & update management
│   │   └── yt-dlp-wrapper.ts   # Binary execution wrapper
│   └── ipc/
│       └── ytdlp-handlers.ts   # IPC handlers
├── helpers/
│   └── ipc/
│       └── ytdlp/
│           └── ytdlp-context.ts # Renderer IPC bridge
└── components/
    └── YtDlpStatus.tsx          # React status component
```

## How It Works

### 1. App Startup

When the app launches:

1. **YtDlpManager.ensureInstalled()** is called
2. Checks if binary exists in `userData/bin/`
3. If not found:
   - Downloads latest binary from GitHub
   - Shows progress to user
   - Makes binary executable (Unix systems)
   - Saves version info
4. If found:
   - Checks for updates in background
   - Notifies user if update available

### 2. Binary Storage

Binaries are stored in:
```
macOS: ~/Library/Application Support/yt-dlp-gui/bin/
Windows: %APPDATA%/yt-dlp-gui/bin/
Linux: ~/.config/yt-dlp-gui/bin/
```

This approach:
- ✅ Reduces app bundle size
- ✅ Allows auto-updates
- ✅ Persists between app updates
- ✅ User can manually delete if needed

### 3. Download Process

```typescript
ytdlpManager.download()
  ↓
Downloads from: github.com/yt-dlp/yt-dlp/releases/latest
  ↓
Progress events sent to renderer:
  - ytdlp:download-started
  - ytdlp:download-progress (with percentage)
  - ytdlp:download-completed
  - ytdlp:download-failed (on error)
  ↓
Binary saved to userData/bin/
  ↓
Made executable (chmod 755 on Unix)
  ↓
Version saved to yt-dlp-version.txt
```

### 4. Update Checking

On each app launch:
1. Fetches latest release from GitHub API
2. Compares with local version
3. If different, sends `ytdlp:update-available` event
4. User can manually trigger update

## API Reference

### Window API (Renderer Process)

All methods are available via `window.ytdlp`:

```typescript
interface YtDlpContext {
  // Check if yt-dlp is installed
  isInstalled(): Promise<boolean>

  // Get current installed version
  getVersion(): Promise<string | null>

  // Check for available updates
  checkUpdates(): Promise<{
    hasUpdate: boolean
    latestVersion: string | null
  }>

  // Download yt-dlp binary
  download(): Promise<{ success: boolean }>

  // Update to latest version
  update(): Promise<{ success: boolean }>

  // Get binary file path
  getPath(): Promise<string>

  // Event listeners
  onDownloadStarted(callback: () => void): void
  onDownloadProgress(callback: (progress: {
    downloaded: number
    total: number
    percentage: number
  }) => void): void
  onDownloadCompleted(callback: (version: string) => void): void
  onDownloadFailed(callback: (error: string) => void): void
  onUpdateAvailable(callback: (version: string) => void): void
}
```

### YtDlpManager (Main Process)

```typescript
class YtDlpManager {
  // Check if binary exists
  isInstalled(): boolean

  // Get current version
  getCurrentVersion(): Promise<string | null>

  // Check for updates
  checkForUpdates(): Promise<{
    hasUpdate: boolean
    latestVersion: string | null
  }>

  // Download binary
  download(onProgress?: (progress: DownloadProgress) => void): Promise<void>

  // Ensure binary is installed (download if needed)
  ensureInstalled(): Promise<void>

  // Get binary path
  getBinaryPath(): string
}
```

### YtDlpWrapper (Main Process)

```typescript
class YtDlpWrapper {
  // Download a video
  downloadVideo(options: {
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
  }): Promise<void>

  // Get video information
  getVideoInfo(url: string): Promise<any>

  // Get available formats
  getFormats(url: string): Promise<any[]>
}
```

## Usage Examples

### React Component with Status

```typescript
import { YtDlpStatus } from '@/components/YtDlpStatus'

function MyPage() {
  return (
    <div>
      <YtDlpStatus showDetails={true} />
      {/* Your other components */}
    </div>
  )
}
```

### Check Installation Status

```typescript
const isInstalled = await window.ytdlp?.isInstalled()
if (!isInstalled) {
  // Trigger download
  await window.ytdlp?.download()
}
```

### Listen to Download Progress

```typescript
useEffect(() => {
  if (!window.ytdlp) return

  window.ytdlp.onDownloadProgress((progress) => {
    console.log(`Downloading: ${progress.percentage.toFixed(1)}%`)
  })

  window.ytdlp.onDownloadCompleted((version) => {
    console.log(`Downloaded version: ${version}`)
  })
}, [])
```

### Check for Updates

```typescript
const { hasUpdate, latestVersion } = await window.ytdlp?.checkUpdates()
if (hasUpdate) {
  console.log(`Update available: ${latestVersion}`)
  await window.ytdlp?.update()
}
```

## Error Handling

### Download Failures

If download fails:
1. Temporary file is cleaned up
2. `ytdlp:download-failed` event is emitted
3. Error message is passed to event listeners
4. UI shows error alert

### Network Issues

- Downloads use HTTPS with redirects handled
- Failures are logged and reported to user
- User can retry download manually

### Permission Issues

On Unix systems:
- Binary is automatically made executable (`chmod 755`)
- If chmod fails, error is logged
- User may need to manually set permissions

## Security Considerations

### Binary Source

- Downloaded from official GitHub releases only
- URL: `https://github.com/yt-dlp/yt-dlp/releases/latest/download/`
- Uses HTTPS for secure download

### Verification

- Version is tracked in `yt-dlp-version.txt`
- Binary path is validated before execution
- No arbitrary code execution

### Updates

- Updates are opt-in (user must approve)
- Version checking uses GitHub API
- User is notified before download

## Troubleshooting

### Binary Not Found

**Symptoms:** Error messages about missing yt-dlp

**Solutions:**
1. Check if app has write permissions to userData directory
2. Manually delete `userData/bin/` folder and restart app
3. Check firewall isn't blocking GitHub downloads

### Download Stuck

**Symptoms:** Progress bar stuck at certain percentage

**Solutions:**
1. Check internet connection
2. Restart app to retry download
3. Check if antivirus is blocking download

### Version Mismatch

**Symptoms:** Update available but won't download

**Solutions:**
1. Delete `userData/bin/yt-dlp-version.txt`
2. Restart app to force re-download
3. Manually download binary and place in `userData/bin/`

### Permission Denied (Unix)

**Symptoms:** Binary exists but won't execute

**Solutions:**
```bash
# Find binary location
cd ~/Library/Application Support/yt-dlp-gui/bin/  # macOS
cd ~/.config/yt-dlp-gui/bin/                      # Linux

# Make executable
chmod +x yt-dlp
```

## Platform-Specific Notes

### macOS
- Binary: `yt-dlp_macos`
- Stored in: `~/Library/Application Support/yt-dlp-gui/bin/`
- May require Gatekeeper approval on first run
- Automatically made executable

### Windows
- Binary: `yt-dlp.exe`
- Stored in: `%APPDATA%/yt-dlp-gui/bin/`
- No special permissions needed
- Antivirus may flag on first download

### Linux
- Binary: `yt-dlp`
- Stored in: `~/.config/yt-dlp-gui/bin/`
- Must be made executable
- May require `libffi` or `libssl` dependencies

## Future Improvements

### Planned Features
- [ ] Integrity verification (SHA256 checksums)
- [ ] Automatic cleanup of old versions
- [ ] Fallback to embedded binary
- [ ] Proxy support for downloads
- [ ] Custom download location

### Performance Optimizations
- [ ] Parallel download chunks
- [ ] Resume interrupted downloads
- [ ] Delta updates (patch files)
- [ ] CDN caching

## Contributing

When modifying yt-dlp integration:

1. Test on all platforms (Windows, macOS, Linux)
2. Verify download/update flow
3. Check error handling
4. Update this documentation
5. Add tests for new features

## Resources

- [yt-dlp GitHub Repository](https://github.com/yt-dlp/yt-dlp)
- [yt-dlp Documentation](https://github.com/yt-dlp/yt-dlp#readme)
- [Electron IPC Guide](https://www.electronjs.org/docs/latest/tutorial/ipc)

