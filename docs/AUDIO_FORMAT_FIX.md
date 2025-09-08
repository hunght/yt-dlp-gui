# Audio Format Fix Documentation

## Problem

When users selected audio formats like MP3, AAC, OPUS, or FLAC in the YouTube downloader, they encountered the following error:

```
Error: Error code: 2 Stderr: Usage: yt-dlp [OPTIONS] URL [URL...] yt-dlp: error: invalid merge output format "mp3" given
```

## Root Cause

The issue was in the `processDownload` function in `src/api/routers/download/service.ts`. The code was using `--merge-output-format` for all output formats, including audio formats:

```typescript
// INCORRECT - Previous implementation
if (outputFormat && outputFormat !== "default") {
  downloadArgs.push("--merge-output-format", outputFormat);
}
```

However, yt-dlp expects different arguments for audio vs video formats:

- **Audio formats** (mp3, aac, opus, flac): Should use `--extract-audio --audio-format FORMAT`
- **Video formats** (mp4, webm, mkv): Should use `--merge-output-format FORMAT`

## Solution

The fix distinguishes between audio and video formats and uses the appropriate yt-dlp arguments:

```typescript
// CORRECT - Fixed implementation
if (outputFormat && outputFormat !== "default") {
  // For audio formats (mp3, aac, opus, flac), use --audio-format
  const audioFormats = ["mp3", "aac", "opus", "flac"];
  if (audioFormats.includes(outputFormat)) {
    downloadArgs.push("--extract-audio", "--audio-format", outputFormat);
  } else {
    // For video formats (mp4, webm, mkv), use --merge-output-format
    downloadArgs.push("--merge-output-format", outputFormat);
  }
}
```

## Examples

### Audio Download Commands

**MP3 Audio:**

```bash
yt-dlp "URL" -f "ba/bestaudio" --extract-audio --audio-format mp3
```

**AAC Audio:**

```bash
yt-dlp "URL" -f "ba/bestaudio" --extract-audio --audio-format aac
```

### Video Download Commands

**MP4 Video:**

```bash
yt-dlp "URL" -f "bestvideo+bestaudio" --merge-output-format mp4
```

**WebM Video:**

```bash
yt-dlp "URL" -f "bestvideo+bestaudio" --merge-output-format webm
```

## Testing

The fix has been thoroughly tested with:

1. **Unit tests** in `src/api/routers/download/audio-format.test.ts` - Tests the argument generation logic
2. **Integration tests** in `src/api/routers/download/index.test.ts` - Tests the full download process
3. **Manual testing** - Verified that audio downloads work correctly in the UI

## Files Modified

1. `src/api/routers/download/service.ts` - Main fix in the `processDownload` function
2. `src/api/routers/download/audio-format.test.ts` - New test suite for audio format handling

## yt-dlp Documentation References

- [yt-dlp Audio Extraction](https://github.com/yt-dlp/yt-dlp#post-processing-options): `--extract-audio --audio-format FORMAT`
- [yt-dlp Format Merging](https://github.com/yt-dlp/yt-dlp#format-selection): `--merge-output-format FORMAT`

## Supported Audio Formats

The fix supports all standard audio formats:

- **MP3** - Most compatible, widely supported
- **AAC** - High quality, good compression
- **OPUS** - Best compression, modern format
- **FLAC** - Lossless, larger file sizes

## Supported Video Formats

The fix continues to support video formats:

- **MP4** - Most compatible video format
- **WebM** - Open source, good compression
- **MKV** - Container format, preserves quality
