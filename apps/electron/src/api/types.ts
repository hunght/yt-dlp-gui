import type { YoutubeVideo } from "./db/schema";

// Download is now YoutubeVideo (downloads table merged into youtube_videos)
export type Download = YoutubeVideo;

// Status enums for better type safety (matching youtube_videos.downloadStatus)
export type DownloadStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "failed"
  | "cancelled"
  | "queued"
  | "paused";

export type ErrorType = "restricted" | "network" | "format" | "unknown";

// Format types (these may need to be defined here if routers/download/types doesn't exist)
export type DownloadFormat = "video" | "audio" | "both";
export type OutputFormat = "mp4" | "webm" | "mp3" | "m4a" | "wav" | "flac";
export type SortBy = "date" | "title" | "duration" | "size";
export type SortOrder = "asc" | "desc";

export interface FormatOption {
  value: DownloadFormat;
  label: string;
  description: string;
}

export interface OutputFormatOption {
  value: OutputFormat;
  label: string;
  description: string;
  category: "video" | "audio";
}

// Format utilities
export const formatOptions: FormatOption[] = [
  { value: "video", label: "Video", description: "Download video with audio" },
  { value: "audio", label: "Audio Only", description: "Extract audio only" },
  { value: "both", label: "Both", description: "Download video and audio separately" },
];

export const outputFormatOptions: OutputFormatOption[] = [
  { value: "mp4", label: "MP4", description: "Standard video format", category: "video" },
  { value: "webm", label: "WebM", description: "Web video format", category: "video" },
  { value: "mp3", label: "MP3", description: "Standard audio format", category: "audio" },
  { value: "m4a", label: "M4A", description: "AAC audio format", category: "audio" },
  { value: "wav", label: "WAV", description: "Lossless audio", category: "audio" },
  { value: "flac", label: "FLAC", description: "Lossless audio", category: "audio" },
];

export const getPopularFormats = () => formatOptions.slice(0, 2);
export const getFormatsByCategory = (category: "video" | "audio") =>
  outputFormatOptions.filter(f => f.category === category);
export const getRecommendedFormats = () => ["mp4", "mp3"];
export const getReliableFormats = () => ["mp4", "mp3", "m4a"];
export const getFormatByValue = (value: string) =>
  formatOptions.find(f => f.value === value);
export const getOutputFormatByValue = (value: string) =>
  outputFormatOptions.find(f => f.value === value);
export const formatToYtDlpSelector = (format: DownloadFormat): string => {
  switch (format) {
    case "video": return "best";
    case "audio": return "bestaudio";
    case "both": return "best+bestaudio";
    default: return "best";
  }
};

// API response types - updated to reflect merged table structure
export type YoutubeVideoWithDownloads = YoutubeVideo; // No longer has separate downloads array

export type DownloadWithVideo = {
  download: YoutubeVideo; // The video IS the download
  video: YoutubeVideo; // Same object for backward compatibility
};
