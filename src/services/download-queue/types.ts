import type { ChildProcess } from "child_process";

/**
 * Status of a download in the queue
 */
export type DownloadStatus =
  | "pending" // Initial state before queued
  | "queued" // Waiting in queue
  | "downloading" // Currently downloading
  | "paused" // Paused by user
  | "completed" // Successfully completed
  | "failed" // Failed with error
  | "cancelled"; // Cancelled by user

/**
 * Represents a download in the queue with all metadata
 */
export interface QueuedDownload {
  id: string;
  url: string;
  videoId: string | null;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  status: DownloadStatus;
  progress: number; // 0-100
  priority: number; // Higher = more important
  queuePosition: number | null;
  format: string | null;
  quality: string | null;
  filePath: string | null;
  fileSize: number | null;
  errorMessage: string | null;
  errorType: string | null;
  isRetryable: boolean;
  retryCount: number;
  maxRetries: number;
  addedAt: number; // createdAt timestamp
  startedAt: number | null; // When download started
  pausedAt: number | null; // When paused
  completedAt: number | null; // When completed
  cancelledAt: number | null; // When cancelled
  updatedAt: number | null;
}

/**
 * Configuration for the download queue
 */
export interface QueueConfig {
  maxConcurrent: number; // Maximum simultaneous downloads (default: 3)
  maxRetries: number; // Maximum retry attempts (default: 3)
  retryDelay: number; // Delay between retries in ms (default: 5000)
  autoStart: boolean; // Auto-start queue when items added (default: true)
}

/**
 * Overall queue status with statistics
 */
export interface QueueStatus {
  queued: QueuedDownload[]; // Items waiting in queue
  downloading: QueuedDownload[]; // Currently downloading
  paused: QueuedDownload[]; // Paused downloads
  completed: QueuedDownload[]; // Recently completed
  failed: QueuedDownload[]; // Failed downloads
  stats: QueueStats;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  totalQueued: number;
  totalActive: number;
  totalPaused: number;
  totalCompleted: number;
  totalFailed: number;
  averageProgress: number; // Average progress of active downloads
}

/**
 * Internal worker state
 */
export interface WorkerState {
  downloadId: string;
  process: ChildProcess | null;
  startTime: number;
  lastProgressUpdate: number;
  // Enhanced metadata for resolving final file path
  lastKnownFilePath?: string;
  outputDir?: string;
  videoId?: string | null;
}

/**
 * Add to queue request
 */
export interface AddToQueueRequest {
  urls: string[];
  priority?: number;
  format?: string;
  quality?: string;
  autoStart?: boolean;
}

