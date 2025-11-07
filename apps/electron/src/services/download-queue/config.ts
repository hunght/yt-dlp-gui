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
