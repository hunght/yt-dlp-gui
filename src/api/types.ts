import type { YoutubeVideo, Download } from "./db/schema";

// Re-export download-specific types for convenience
export type {
  DownloadFormat,
  OutputFormat,
  SortBy,
  SortOrder,
  FormatOption,
  OutputFormatOption,
} from "./routers/download/types";

// Re-export format utilities for UI components
export {
  formatOptions,
  outputFormatOptions,
  getPopularFormats,
  getFormatsByCategory,
  getFormatByValue,
  getOutputFormatByValue,
  formatToYtDlpSelector,
} from "./routers/download/types";

// API response types

// Extended types with relations
export type YoutubeVideoWithDownloads = YoutubeVideo & {
  downloads: Download[];
};

export type DownloadWithVideo = {
  downloads: Download;
  video: YoutubeVideo | null;
};

// Status enums for better type safety
export type DownloadStatus = "pending" | "downloading" | "completed" | "failed" | "cancelled";
export type ErrorType = "restricted" | "network" | "format" | "unknown";
