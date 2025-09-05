import { z } from "zod";

// Download format types
export const downloadFormats = [
  "best", // Highest quality available
  "best720p", // Best quality up to 720p (good balance)
  "best480p", // Best quality up to 480p (smaller files)
  "best1080p", // Best quality up to 1080p (high quality)
  "audioonly", // Audio only download
  "mp4best", // Best MP4 format
  "webmbest", // Best WebM format
] as const;

export type DownloadFormat = (typeof downloadFormats)[number];

// Output format types
export const outputFormats = ["default", "mp4", "mp3"] as const;
export type OutputFormat = (typeof outputFormats)[number];

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
    case "best":
      return "best";
    case "best720p":
      return "best[height<=720]";
    case "best480p":
      return "best[height<=480]";
    case "best1080p":
      return "best[height<=1080]";
    case "audioonly":
      return "bestaudio";
    case "mp4best":
      return "best[ext=mp4]/best";
    case "webmbest":
      return "best[ext=webm]/best";
    default:
      return "";
  }
}
