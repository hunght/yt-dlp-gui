import type { YoutubeVideo, Download, DownloadStatus } from "./db/schema";

// API response types
export interface VideoInfo extends YoutubeVideo {
  duration?: number | null; // Alternative field name used in some contexts
  durationFormatted?: string;
}
