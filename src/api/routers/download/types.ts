import { z } from "zod";

// Download format types organized by category and popularity
export const downloadFormats = [
  // Recommended reliable formats (tested and working)
  "bestvideo+bestaudio", // Most reliable option (recommended)
  "best", // Highest quality fallback
  "best720p", // HD quality with fallback
  "best480p", // Standard quality with fallback

  // Audio-only options (reliable)
  "audioonly", // Audio only download (best quality)
  "audio320", // Audio only 320kbps (high quality)
  "audio128", // Audio only 128kbps (smaller size)

  // Format-specific options (tested reliability)
  "webmbest", // WebM format (reliable, smaller files)
  "mp4compatible", // MP4 with better compatibility

  // Advanced options
  "best4k", // Best quality up to 4K (2160p)
  "best60fps", // Best quality with 60fps preference
  "bestsmall", // Best quality under 500MB
  "fallbacksafe", // Ultra-safe fallback option

  // Legacy options (may have compatibility issues)
  "best1080p", // Best quality up to 1080p (may fail)
  "mp4best", // Best MP4 format (may have restrictions)
  "av1best", // Best AV1 format (limited availability)
  "worstgood", // Worst quality that's still good (360p+)
] as const;

export type DownloadFormat = (typeof downloadFormats)[number];

// Output format types (post-processing options)
export const outputFormats = [
  "default", // Keep original format
  "mp4", // Convert to MP4 (most compatible)
  "webm", // Convert to WebM (smaller files)
  "mkv", // Convert to MKV (preserves quality)
  "mp3", // Audio: MP3 (most compatible)
  "aac", // Audio: AAC (high quality)
  "opus", // Audio: Opus (best compression)
  "flac", // Audio: FLAC (lossless)
] as const;
export type OutputFormat = (typeof outputFormats)[number];

// Format metadata for UI display
export interface FormatOption {
  value: DownloadFormat;
  label: string;
  description: string;
  category: "video" | "audio" | "advanced" | "recommended";
  popular?: boolean;
  fileSize: "small" | "medium" | "large";
  quality: "low" | "medium" | "high" | "highest";
  reliability: "excellent" | "good" | "fair" | "experimental";
  compatibility: "universal" | "high" | "medium" | "limited";
}

// Format options with metadata for UI
export const formatOptions: FormatOption[] = [
  // Recommended reliable formats (tested and working)
  {
    value: "bestvideo+bestaudio",
    label: "Best Quality (Reliable)",
    description: "✅ Most reliable option - downloads best video and audio separately then merges",
    category: "recommended",
    popular: true,
    fileSize: "large",
    quality: "highest",
    reliability: "excellent",
    compatibility: "universal",
  },
  {
    value: "best",
    label: "Best Quality (Fallback)",
    description: "High quality with smart fallback - good reliability",
    category: "recommended",
    popular: true,
    fileSize: "large",
    quality: "highest",
    reliability: "good",
    compatibility: "high",
  },
  {
    value: "best720p",
    label: "720p HD (Reliable)",
    description: "HD quality with fallback - good balance of size, quality and reliability",
    category: "recommended",
    popular: true,
    fileSize: "medium",
    quality: "high",
    reliability: "good",
    compatibility: "high",
  },
  {
    value: "best480p",
    label: "480p SD (Small)",
    description: "Standard quality with fallback - smaller file size, good reliability",
    category: "recommended",
    popular: true,
    fileSize: "small",
    quality: "medium",
    reliability: "good",
    compatibility: "high",
  },

  // Audio-only options (reliable)
  {
    value: "audioonly",
    label: "Audio Only (Best)",
    description: "✅ Best available audio quality - very reliable",
    category: "audio",
    popular: true,
    fileSize: "small",
    quality: "highest",
    reliability: "excellent",
    compatibility: "universal",
  },
  {
    value: "audio320",
    label: "Audio 320kbps",
    description: "High quality audio (320kbps) - good reliability",
    category: "audio",
    fileSize: "small",
    quality: "high",
    reliability: "good",
    compatibility: "high",
  },
  {
    value: "audio128",
    label: "Audio 128kbps",
    description: "Standard quality audio - smaller size, good reliability",
    category: "audio",
    fileSize: "small",
    quality: "medium",
    reliability: "good",
    compatibility: "high",
  },

  // Format-specific options (tested reliability)
  {
    value: "webmbest",
    label: "WebM Format",
    description: "✅ WebM format - reliable, smaller files, open source",
    category: "video",
    fileSize: "small",
    quality: "high",
    reliability: "excellent",
    compatibility: "high",
  },
  {
    value: "mp4compatible",
    label: "MP4 Compatible",
    description: "MP4 format with better compatibility than standard MP4 selector",
    category: "video",
    fileSize: "medium",
    quality: "high",
    reliability: "good",
    compatibility: "high",
  },

  // Advanced options
  {
    value: "best4k",
    label: "4K Ultra HD",
    description: "Ultra HD quality (3840x2160) - very large files, may have restrictions",
    category: "advanced",
    fileSize: "large",
    quality: "highest",
    reliability: "fair",
    compatibility: "medium",
  },
  {
    value: "best60fps",
    label: "60fps Preferred",
    description: "Prefer smooth 60fps video - may have compatibility issues",
    category: "advanced",
    fileSize: "large",
    quality: "high",
    reliability: "fair",
    compatibility: "medium",
  },
  {
    value: "bestsmall",
    label: "Small File Size",
    description: "Best quality under 500MB - good for limited storage",
    category: "advanced",
    fileSize: "small",
    quality: "medium",
    reliability: "good",
    compatibility: "medium",
  },
  {
    value: "fallbacksafe",
    label: "Ultra Safe Fallback",
    description: "✅ Ultra-reliable fallback option - works on almost all videos",
    category: "advanced",
    fileSize: "medium",
    quality: "medium",
    reliability: "excellent",
    compatibility: "universal",
  },

  // Legacy options (may have compatibility issues)
  {
    value: "best1080p",
    label: "1080p HD (Legacy)",
    description: "⚠️ Full HD quality - may fail on some videos due to restrictions",
    category: "advanced",
    fileSize: "large",
    quality: "high",
    reliability: "fair",
    compatibility: "medium",
  },
  {
    value: "mp4best",
    label: "MP4 Format (Legacy)",
    description: "⚠️ Best MP4 format - may have restrictions or 403 errors",
    category: "advanced",
    fileSize: "medium",
    quality: "high",
    reliability: "fair",
    compatibility: "limited",
  },
  {
    value: "av1best",
    label: "AV1 Format",
    description: "⚠️ Newest codec - best compression but limited availability",
    category: "advanced",
    fileSize: "small",
    quality: "high",
    reliability: "experimental",
    compatibility: "limited",
  },
  {
    value: "worstgood",
    label: "Minimal Quality",
    description: "Smallest files while staying watchable (360p+) - may have issues",
    category: "advanced",
    fileSize: "small",
    quality: "low",
    reliability: "fair",
    compatibility: "medium",
  },
];

// Output format metadata
export interface OutputFormatOption {
  value: OutputFormat;
  label: string;
  description: string;
  category: "video" | "audio";
  compatibility: "excellent" | "good" | "limited";
  quality: "lossless" | "high" | "good";
}

export const outputFormatOptions: OutputFormatOption[] = [
  {
    value: "default",
    label: "Keep Original",
    description: "No conversion - keep original format",
    category: "video",
    compatibility: "good",
    quality: "lossless",
  },
  {
    value: "mp4",
    label: "MP4",
    description: "Most compatible video format",
    category: "video",
    compatibility: "excellent",
    quality: "high",
  },
  {
    value: "webm",
    label: "WebM",
    description: "Open source format - smaller files",
    category: "video",
    compatibility: "good",
    quality: "high",
  },
  {
    value: "mkv",
    label: "MKV",
    description: "Preserves highest quality",
    category: "video",
    compatibility: "good",
    quality: "lossless",
  },
  {
    value: "mp3",
    label: "MP3",
    description: "Most compatible audio format",
    category: "audio",
    compatibility: "excellent",
    quality: "good",
  },
  {
    value: "aac",
    label: "AAC",
    description: "High quality audio format",
    category: "audio",
    compatibility: "excellent",
    quality: "high",
  },
  {
    value: "opus",
    label: "Opus",
    description: "Best compression audio format",
    category: "audio",
    compatibility: "good",
    quality: "high",
  },
  {
    value: "flac",
    label: "FLAC",
    description: "Lossless audio format",
    category: "audio",
    compatibility: "limited",
    quality: "lossless",
  },
];

// Helper functions for UI
export function getPopularFormats(): FormatOption[] {
  return formatOptions.filter((option) => option.popular);
}

export function getFormatsByCategory(category: FormatOption["category"]): FormatOption[] {
  return formatOptions.filter((option) => option.category === category);
}

export function getRecommendedFormats(): FormatOption[] {
  return formatOptions.filter((option) => option.category === "recommended");
}

export function getReliableFormats(): FormatOption[] {
  return formatOptions.filter((option) => option.reliability === "excellent");
}

export function getFormatByValue(value: DownloadFormat): FormatOption | undefined {
  return formatOptions.find((option) => option.value === value);
}

export function getOutputFormatByValue(value: OutputFormat): OutputFormatOption | undefined {
  return outputFormatOptions.find((option) => option.value === value);
}

// Sort options
export const sortByOptions = ["createdAt", "videoId", "status"] as const;
export type SortBy = (typeof sortByOptions)[number];

export const sortOrderOptions = ["asc", "desc"] as const;
export type SortOrder = (typeof sortOrderOptions)[number];

// Zod schemas derived from types
export const downloadFormatSchema = z.enum(downloadFormats).optional();
export const outputFormatSchema = z.enum(outputFormats).optional();
export const sortBySchema = z.enum(sortByOptions).default("createdAt");
export const sortOrderSchema = z.enum(sortOrderOptions).default("desc");

// Download status (already exists in main types.ts but adding for completeness)
export const downloadStatuses = [
  "pending",
  "downloading",
  "completed",
  "failed",
  "cancelled",
] as const;
export const downloadStatusSchema = z.enum(downloadStatuses).optional();

// Common input schemas
export const startDownloadInputSchema = z.object({
  url: z.string().url("Invalid URL"),
  format: downloadFormatSchema,
  outputPath: z.string().optional(),
  outputFilename: z.string().optional(),
  outputFormat: outputFormatSchema,
});

export const getDownloadsInputSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  status: downloadStatusSchema,
  sortBy: sortBySchema,
  sortOrder: sortOrderSchema,
});

// Function parameter types
export interface ProcessDownloadParams {
  downloadId: string;
  url: string;
  format?: DownloadFormat;
  outputPath?: string;
  outputFilename?: string;
  outputFormat?: OutputFormat;
  db: any;
}

// Helper function to convert enum format to yt-dlp format
export function formatToYtDlpSelector(format: DownloadFormat): string {
  switch (format) {
    // Recommended reliable formats (tested and working)
    case "bestvideo+bestaudio":
      return "bestvideo+bestaudio"; // Most reliable - downloads best video and audio separately
    case "best":
      return "bv*+ba/b"; // Best video + best audio, fallback to best combined
    case "best720p":
      return "bv*[height<=720]+ba/b[height<=720]"; // Best video up to 720p + audio
    case "best480p":
      return "bv*[height<=480]+ba/b[height<=480]"; // Best video up to 480p + audio

    // Audio-only options (reliable)
    case "audioonly":
      return "ba/bestaudio"; // Best audio only
    case "audio320":
      return "ba[abr<=320]/bestaudio[abr<=320]"; // Audio up to 320kbps
    case "audio128":
      return "ba[abr<=128]/bestaudio[abr<=128]"; // Audio up to 128kbps

    // Format-specific options (tested reliability)
    case "webmbest":
      return "bv*[ext=webm]+ba[ext=webm]/b[ext=webm]"; // Best WebM video + WebM audio (reliable)
    case "mp4compatible":
      return "bv*+ba[ext=m4a]/b[ext=mp4]/bv*+ba"; // MP4 with better compatibility

    // Advanced options
    case "best4k":
      return "bv*[height<=2160]+ba/b[height<=2160]"; // Best video up to 4K + audio
    case "best60fps":
      return "bv*[fps>=60]+ba/bv*[fps>=30]+ba/bv*+ba"; // Prefer 60fps, fallback to 30fps+
    case "bestsmall":
      return "b[filesize<500M]/bv*[filesize<400M]+ba[filesize<100M]/b"; // Under 500MB total
    case "fallbacksafe":
      return "worst[height>=360]/bv*[height>=360]+ba/ba"; // Ultra-safe fallback option

    // Legacy options (may have compatibility issues)
    case "best1080p":
      return "bv*[height<=1080]+ba/b[height<=1080]"; // Best video up to 1080p + audio
    case "mp4best":
      return "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]"; // Best MP4 video + M4A audio (may fail)
    case "av1best":
      return "bv*[vcodec^=av01]+ba/b[vcodec^=av01]"; // Best AV1 codec
    case "worstgood":
      return "bv*[height>=360]+ba/b[height>=360]"; // At least 360p quality

    default:
      return "bestvideo+bestaudio"; // Default to most reliable option
  }
}
