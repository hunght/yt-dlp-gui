import type { QueueConfig } from "./types";

/**
 * Default queue configuration
 */
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxConcurrent: 3, // Max 3 simultaneous downloads
  maxRetries: 3, // Retry up to 3 times
  retryDelay: 5000, // 5 seconds base delay
  autoStart: true, // Auto-start queue when items added
};

/**
 * Default retry strategy with exponential backoff
 */
export const DEFAULT_RETRY_STRATEGY = {
  shouldRetry: (error: Error, retryCount: number): boolean => {
    // Don't retry if max retries exceeded
    if (retryCount >= DEFAULT_QUEUE_CONFIG.maxRetries) {
      return false;
    }

    const errorMessage = error.message.toLowerCase();

    // Retryable errors
    if (errorMessage.includes("network")) return true;
    if (errorMessage.includes("timeout")) return true;
    if (errorMessage.includes("connection")) return true;
    if (errorMessage.includes("429")) return true; // Rate limit
    if (errorMessage.includes("503")) return true; // Service unavailable
    if (errorMessage.includes("timed out")) return true;

    // Non-retryable errors
    if (errorMessage.includes("video unavailable")) return false;
    if (errorMessage.includes("private video")) return false;
    if (errorMessage.includes("video has been removed")) return false;
    if (errorMessage.includes("this video is not available")) return false;
    if (errorMessage.includes("copyright")) return false;

    // Default: retry unknown errors
    return true;
  },

  getDelay: (retryCount: number): number => {
    // Exponential backoff: 5s, 10s, 20s, 40s (capped at 30s)
    const baseDelay = DEFAULT_QUEUE_CONFIG.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    return Math.min(exponentialDelay, 30000); // Cap at 30 seconds
  },
};

/**
 * Queue storage keys for persistence
 */
export const QUEUE_STORAGE_KEYS = {
  ACTIVE_QUEUE: "download_queue_active",
  COMPLETED: "download_queue_completed",
  FAILED: "download_queue_failed",
  CONFIG: "download_queue_config",
} as const;

/**
 * Queue limits and constraints
 */
export const QUEUE_LIMITS = {
  MAX_QUEUE_SIZE: 1000, // Maximum items in queue
  MAX_BATCH_ADD: 100, // Maximum URLs to add at once
  PROGRESS_UPDATE_INTERVAL: 500, // Update progress every 500ms
  CLEANUP_INTERVAL: 60000, // Cleanup old completed items every 60s
  MAX_COMPLETED_HISTORY: 100, // Keep last 100 completed downloads
} as const;

/**
 * Error classification patterns
 */
export const ERROR_PATTERNS = {
  network: [
    /network/i,
    /connection/i,
    /timeout/i,
    /timed out/i,
    /unable to download/i,
    /failed to connect/i,
  ],
  restricted: [
    /private video/i,
    /video unavailable/i,
    /video has been removed/i,
    /this video is not available/i,
    /video is unavailable/i,
  ],
  format: [
    /requested format not available/i,
    /unsupported url/i,
    /no video formats/i,
  ],
  rate_limit: [/429/, /too many requests/i, /rate limit/i],
  disk_space: [/no space left/i, /disk full/i, /insufficient space/i],
} as const;
