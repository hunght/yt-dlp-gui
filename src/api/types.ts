import type { YoutubeVideo, Download } from "./db/schema";

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
