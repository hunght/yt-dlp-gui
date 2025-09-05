# YouTube Downloader System Documentation

A comprehensive guide to the YouTube downloader system built with tRPC, TypeScript, and yt-dlp integration.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Format Selection](#format-selection)
- [Download Process](#download-process)
- [Database Schema](#database-schema)
- [Error Handling](#error-handling)
- [Examples](#examples)
- [yt-dlp Integration](#yt-dlp-integration)

## Overview

This system provides a type-safe API for downloading YouTube videos and audio using yt-dlp as the underlying download engine. It features:

- **Type-safe API** using tRPC and TypeScript
- **Format selection** with predefined quality options
- **Progress tracking** with real-time status updates
- **Database persistence** for download history and metadata
- **Thumbnail management** with local caching
- **Error handling** with detailed error messages

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend UI   │◄──►│   tRPC Router   │◄──►│   yt-dlp CLI    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   SQLite DB     │
                       │  (Drizzle ORM)  │
                       └─────────────────┘
```

### Core Components

- **Download Router** (`src/api/routers/download/index.ts`): Main API endpoints
- **Download Service** (`src/api/routers/download/service.ts`): Business logic and yt-dlp integration
- **Type Definitions** (`src/api/routers/download/types.ts`): TypeScript types and schemas
- **Database Schema** (`src/api/db/schema.ts`): Data models for downloads and videos

## API Reference

### Download Router Endpoints

#### `startDownload`

Initiates a new video download.

```typescript
input: {
  url: string;           // YouTube video URL
  format?: DownloadFormat; // Quality preset (optional)
  outputPath?: string;   // Custom output directory (optional)
  outputFilename?: string; // Custom filename (optional)
  outputFormat?: OutputFormat; // File format conversion (optional)
}

output: {
  id: string;           // Unique download ID
  status: DownloadStatus; // Current status
  videoInfo: YoutubeVideo | null; // Video metadata (if available)
}
```

#### `getDownloads`

Retrieves download history with pagination and filtering.

```typescript
input: {
  page?: number;        // Page number (default: 1)
  limit?: number;       // Items per page (default: 20, max: 100)
  status?: DownloadStatus; // Filter by status (optional)
  sortBy?: SortBy;      // Sort field (default: "createdAt")
  sortOrder?: SortOrder; // Sort direction (default: "desc")
}

output: {
  downloads: DownloadWithVideo[]; // Download records with video info
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
```

#### `getDownloadById`

Retrieves a specific download by ID.

```typescript
input: {
  id: string; // Download ID
}

output: DownloadWithVideo | null; // Download record with video info
```

#### `cancelDownload`

Cancels an active download.

```typescript
input: {
  id: string; // Download ID
}

output: {
  success: boolean; // Operation result
}
```

#### `deleteDownload`

Deletes a download record and associated files.

```typescript
input: {
  id: string; // Download ID
}

output: {
  success: boolean; // Operation result
}
```

#### `getVideoInfo`

Extracts and caches video metadata without downloading.

```typescript
input: {
  url: string;          // YouTube video URL
}

output: {
  success: boolean;
  videoInfo?: YoutubeVideo; // Video metadata
  error?: string;       // Error message if failed
}
```

## Format Selection

### Available Download Formats

The system provides comprehensive format options organized by category and popularity:

#### Popular Video Formats (Most Common)

```typescript
export const popularFormats = [
  "best", // Highest quality available (recommended)
  "best1080p", // Full HD quality (1920x1080)
  "best720p", // HD quality - good balance of size and quality
  "best480p", // Standard quality - smaller file size
] as const;
```

#### Audio-Only Options

```typescript
export const audioFormats = [
  "audioonly", // Best available audio quality
  "audio320", // High quality audio (320kbps)
  "audio128", // Standard quality audio - smaller size
] as const;
```

#### Format-Specific Options

```typescript
export const formatSpecific = [
  "mp4best", // Best MP4 format (most compatible)
  "webmbest", // Best WebM format (open source)
  "av1best", // Newest codec - best compression
] as const;
```

#### Advanced Options

```typescript
export const advancedFormats = [
  "best4k", // Ultra HD quality (3840x2160)
  "best60fps", // Prefer smooth 60fps video
  "bestsmall", // Best quality under 500MB
  "worstgood", // Smallest files while staying watchable (360p+)
] as const;
```

### yt-dlp Format Mapping

Each format option maps to specific yt-dlp format selectors:

| Format Option | yt-dlp Selector                                           | Description                                        | File Size  | Quality |
| ------------- | --------------------------------------------------------- | -------------------------------------------------- | ---------- | ------- |
| `best`        | `bv*+ba/b`                                                | Best video + best audio, fallback to best combined | Large      | Highest |
| `best1080p`   | `bv*[height<=1080]+ba/b[height<=1080]`                    | Full HD quality                                    | Large      | High    |
| `best720p`    | `bv*[height<=720]+ba/b[height<=720]`                      | HD quality - good balance                          | Medium     | High    |
| `best480p`    | `bv*[height<=480]+ba/b[height<=480]`                      | Standard quality                                   | Small      | Medium  |
| `audioonly`   | `ba/bestaudio`                                            | Best audio only                                    | Small      | Highest |
| `audio320`    | `ba[abr<=320]/bestaudio[abr<=320]`                        | Audio up to 320kbps                                | Small      | High    |
| `audio128`    | `ba[abr<=128]/bestaudio[abr<=128]`                        | Audio up to 128kbps                                | Small      | Medium  |
| `mp4best`     | `bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]`                     | Best MP4 video + M4A audio                         | Medium     | High    |
| `webmbest`    | `bv*[ext=webm]+ba[ext=webm]/b[ext=webm]`                  | Best WebM video + WebM audio                       | Small      | High    |
| `av1best`     | `bv*[vcodec^=av01]+ba/b[vcodec^=av01]`                    | Best AV1 codec                                     | Small      | High    |
| `best4k`      | `bv*[height<=2160]+ba/b[height<=2160]`                    | Ultra HD quality                                   | Very Large | Highest |
| `best60fps`   | `bv*[fps>=60]+ba/bv*[fps>=30]+ba/bv*+ba`                  | Prefer 60fps, fallback to 30fps+                   | Large      | High    |
| `bestsmall`   | `b[filesize<500M]/bv*[filesize<400M]+ba[filesize<100M]/b` | Under 500MB total                                  | Small      | Medium  |
| `worstgood`   | `bv*[height>=360]+ba/b[height>=360]`                      | At least 360p quality                              | Small      | Low     |

### Output Formats

Enhanced post-processing options for format conversion:

| Format    | Description                              | Category | Compatibility | Quality  |
| --------- | ---------------------------------------- | -------- | ------------- | -------- |
| `default` | Keep original format from yt-dlp         | -        | Good          | Lossless |
| `mp4`     | Convert to MP4 (most compatible)         | Video    | Excellent     | High     |
| `webm`    | Convert to WebM (smaller files)          | Video    | Good          | High     |
| `mkv`     | Convert to MKV (preserves quality)       | Video    | Good          | Lossless |
| `mp3`     | Convert to MP3 audio (most compatible)   | Audio    | Excellent     | Good     |
| `aac`     | Convert to AAC audio (high quality)      | Audio    | Excellent     | High     |
| `opus`    | Convert to Opus audio (best compression) | Audio    | Good          | High     |
| `flac`    | Convert to FLAC audio (lossless)         | Audio    | Limited       | Lossless |

### UI Integration

The enhanced format system provides metadata for rich UI components:

```typescript
// Get popular formats for default view
const popularOptions = getPopularFormats();

// Get formats by category for organized display
const videoFormats = getFormatsByCategory("video");
const audioFormats = getFormatsByCategory("audio");
const advancedFormats = getFormatsByCategory("advanced");

// Get format details for tooltips and descriptions
const formatDetails = getFormatByValue("best720p");
console.log(formatDetails?.description); // "HD quality - good balance of size and quality"
```

## Download Process

### 1. Request Initiation

```typescript
// Example: Start a download
const result = await api.download.startDownload.mutate({
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  format: "best720p",
  outputFormat: "mp4",
});
```

### 2. Background Processing

The system processes downloads asynchronously:

1. **Video ID Extraction**: Extract video ID from URL
2. **Metadata Retrieval**: Fetch video information using yt-dlp
3. **Database Recording**: Store video metadata and download record
4. **Thumbnail Download**: Cache thumbnail locally
5. **File Download**: Execute yt-dlp with selected format
6. **Progress Updates**: Update download status and progress
7. **Post-processing**: Apply format conversion if specified
8. **Completion**: Mark download as completed and update file path

### 3. Status Tracking

Downloads progress through these states:

```typescript
export const downloadStatuses = [
  "pending", // Queued for processing
  "downloading", // Active download in progress
  "completed", // Successfully completed
  "failed", // Download failed with error
  "cancelled", // User cancelled the download
] as const;
```

## Database Schema

### Downloads Table

```sql
CREATE TABLE downloads (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  video_id TEXT,
  status TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  format TEXT,
  output_format TEXT,
  file_path TEXT,
  file_size INTEGER,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### YouTube Videos Table

```sql
CREATE TABLE youtube_videos (
  video_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  channel_name TEXT,
  channel_id TEXT,
  duration INTEGER,
  view_count INTEGER,
  published_at INTEGER,
  thumbnail_url TEXT,
  thumbnail_path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## Error Handling

### Common Error Scenarios

1. **Invalid URL**: URL format validation fails
2. **Video Unavailable**: Video is private, deleted, or geo-blocked
3. **Network Errors**: Connection timeouts or network issues
4. **Disk Space**: Insufficient storage space
5. **Permission Errors**: File system access denied
6. **yt-dlp Errors**: External tool failures

### Error Response Format

```typescript
{
  success: false,
  error: "Detailed error message",
  code?: "ERROR_CODE" // Optional error code for specific handling
}
```

## Examples

### Basic Download

```typescript
// Start a basic download with default settings
const download = await api.download.startDownload.mutate({
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
});

console.log(`Download started with ID: ${download.id}`);
```

### High Quality Download

```typescript
// Download in best quality up to 1080p as MP4
const download = await api.download.startDownload.mutate({
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  format: "best1080p",
  outputFormat: "mp4",
  outputPath: "/Users/username/Downloads/Videos",
});
```

### Audio Only Download

```typescript
// Extract audio only and convert to MP3
const download = await api.download.startDownload.mutate({
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  format: "audioonly",
  outputFormat: "mp3",
  outputFilename: "my-favorite-song",
});
```

### Get Download History

```typescript
// Get recent downloads with pagination
const result = await api.download.getDownloads.query({
  page: 1,
  limit: 10,
  status: "completed",
  sortBy: "createdAt",
  sortOrder: "desc",
});

result.downloads.forEach((download) => {
  console.log(`${download.video?.title}: ${download.status}`);
});
```

### Monitor Download Progress

```typescript
// Poll for download status updates
const downloadId = "uuid-here";
const checkProgress = async () => {
  const download = await api.download.getDownloadById.query({ id: downloadId });
  if (download) {
    console.log(`Progress: ${download.progress}% - Status: ${download.status}`);
    if (download.status === "downloading") {
      setTimeout(checkProgress, 1000); // Check again in 1 second
    }
  }
};

checkProgress();
```

## yt-dlp Integration

### Command Line Options Used

The system utilizes these yt-dlp options:

- `--format` (`-f`): Video format selection
- `--output` (`-o`): Output filename template
- `--write-info-json`: Extract metadata
- `--write-thumbnail`: Download thumbnails
- `--extract-flat`: For playlist processing
- `--newline`: Progress output formatting
- `--no-warnings`: Cleaner output
- `--progress-template`: Custom progress reporting

### Format Selection Details

Based on yt-dlp's format selection syntax:

- `bv*`: Best video format (may include audio)
- `ba`: Best audio-only format
- `b`: Best combined format (video + audio)
- `[height<=720]`: Filter by maximum height
- `[ext=mp4]`: Filter by file extension
- `+`: Merge video and audio formats
- `/`: Fallback operator

### Advanced Format Examples

For reference, these are additional yt-dlp format options that could be added:

```typescript
// Advanced format options (not currently implemented)
"best[fps>=30]"; // Prefer 30fps or higher
"best[filesize<100M]"; // Files under 100MB
"bv*[vcodec^=avc1]+ba"; // H.264 video + best audio
"worst[height>=480]"; // Worst quality but at least 480p
"bv[height<=720][fps<=30]+ba"; // 720p max, 30fps max + audio
```

## Performance Considerations

### Optimization Strategies

1. **Concurrent Downloads**: Limit active downloads to prevent system overload
2. **Thumbnail Caching**: Store thumbnails locally to avoid re-downloading
3. **Metadata Caching**: Cache video information to speed up subsequent requests
4. **Progress Throttling**: Update progress at reasonable intervals
5. **Database Indexing**: Optimize queries with proper indexes

### Resource Management

- **Memory**: yt-dlp processes are memory-efficient but monitor for leaks
- **Disk Space**: Implement cleanup policies for old downloads
- **Network**: Respect rate limits and implement retry logic
- **CPU**: Consider download concurrency based on system capabilities

## Configuration

### Environment Variables

```bash
# yt-dlp binary path (if not in PATH)
YTDLP_PATH=/usr/local/bin/yt-dlp

# Default download directory
DEFAULT_DOWNLOAD_PATH=/Users/username/Downloads

# Maximum concurrent downloads
MAX_CONCURRENT_DOWNLOADS=3

# Thumbnail cache directory
THUMBNAIL_CACHE_PATH=/tmp/yt-dlp-thumbnails
```

### System Requirements

- **yt-dlp**: Latest version recommended
- **ffmpeg**: Required for format conversion and merging
- **Node.js**: 18+ for async/await and modern features
- **SQLite**: For database storage
- **Disk Space**: Adequate space for downloads and cache

---

_This documentation is based on yt-dlp version 2025.08.27 and may need updates as the tool evolves._
