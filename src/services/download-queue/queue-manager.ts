import { eq, and, or, isNull } from "drizzle-orm";
import { downloads } from "@/api/db/schema";
import type { Database } from "@/api/db";
import { DEFAULT_QUEUE_CONFIG } from "./config";
import type { QueueConfig, QueueStatus, QueueStats } from "./types";
import { spawnDownload, killDownload, isDownloadActive } from "./download-worker";
import {
  loadQueueFromDatabase,
  updateDownloadStatus,
  updateQueuePositions,
} from "./queue-persistence";
import { logger } from "@/helpers/logger";
import { app } from "electron";
import path from "path";

/**
 * Simple queue manager that processes downloads with max concurrent limit
 */
class QueueManager {
  private db: Database;
  private config: QueueConfig;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(db: Database, config: Partial<QueueConfig> = {}) {
    this.db = db;
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  /**
   * Start the queue processor
   */
  start(): void {
    if (this.isProcessing) {
      logger.warn("[queue-manager] Queue already running");
      return;
    }

    this.isProcessing = true;
    logger.info("[queue-manager] Starting queue processor", {
      maxConcurrent: this.config.maxConcurrent,
    });

    // Process queue every 2 seconds
    this.processingInterval = setInterval(() => {
      this.processQueue().catch((error) => {
        logger.error("[queue-manager] Error processing queue", error as Error);
      });
    }, 2000);

    // Process immediately
    this.processQueue().catch((error) => {
      logger.error("[queue-manager] Error processing queue", error as Error);
    });
  }

  /**
   * Stop the queue processor
   */
  stop(): void {
    if (!this.isProcessing) {
      return;
    }

    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    logger.info("[queue-manager] Stopped queue processor");
  }

  /**
   * Process the queue - start downloads if under max concurrent limit
   */
  private async processQueue(): Promise<void> {
    try {
      // Count active downloads
      const activeCount = await this.db
        .select({ count: downloads.id })
        .from(downloads)
        .where(eq(downloads.status, "downloading"))
        .execute()
        .then((rows) => rows.length);

      // Check if we can start more downloads
      const availableSlots = this.config.maxConcurrent - activeCount;
      if (availableSlots <= 0) {
        return; // All slots filled
      }

      // Get next queued downloads
      const nextDownloads = await this.db
        .select()
        .from(downloads)
        .where(eq(downloads.status, "queued"))
        .orderBy(downloads.queuePosition)
        .limit(availableSlots)
        .execute();

      // Start each download
      for (const download of nextDownloads) {
        try {
          // Get output path
          const downloadsRoot =
            path.join(app.getPath("downloads"), "yt-dlp-gui");
          const outputPath = path.join(downloadsRoot, "%(title)s.%(ext)s");

          // Spawn download
          await spawnDownload(
            this.db,
            download.id,
            download.url,
            download.format,
            outputPath,
          );

          logger.info("[queue-manager] Started download", {
            id: download.id,
            url: download.url,
          });
        } catch (error) {
          logger.error(
            "[queue-manager] Failed to start download",
            error as Error,
          );
        }
      }
    } catch (error) {
      logger.error("[queue-manager] Error in processQueue", error as Error);
    }
  }

  /**
   * Add downloads to queue
   */
  async addToQueue(
    urls: string[],
    options: {
      priority?: number;
      format?: string;
      quality?: string;
    } = {},
  ): Promise<string[]> {
    const downloadIds: string[] = [];

    try {
      // Get current max queue position
      const maxPosition = await this.db
        .select({ max: downloads.queuePosition })
        .from(downloads)
        .execute()
        .then((rows) => rows[0]?.max ?? 0);

      let position = (maxPosition as number) + 1;

      for (const url of urls) {
        // Generate unique ID
        const id = `download-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const now = Date.now();

        // Create download record
        const [download] = await this.db
          .insert(downloads)
          .values({
            id,
            url,
            createdAt: now,
            status: "queued" as const,
            progress: 0,
            priority: options.priority ?? 0,
            queuePosition: position++,
            format: options.format ?? null,
            quality: options.quality ?? null,
            retryCount: 0,
            maxRetries: this.config.maxRetries,
            isRetryable: true,
          })
          .returning();

        if (download) {
          downloadIds.push(download.id);
        }
      }

      logger.info("[queue-manager] Added to queue", {
        count: downloadIds.length,
        ids: downloadIds,
      });

      // Auto-start if configured
      if (this.config.autoStart && !this.isProcessing) {
        this.start();
      }

      return downloadIds;
    } catch (error) {
      logger.error("[queue-manager] Failed to add to queue", error as Error);
      throw error;
    }
  }

  /**
   * Pause a download
   */
  async pauseDownload(downloadId: string): Promise<void> {
    try {
      // Kill the download process if active
      const wasActive = killDownload(downloadId);

      // Update status to paused
      await updateDownloadStatus(this.db, downloadId, "paused", {
        pausedAt: Date.now(),
      });

      logger.info("[queue-manager] Paused download", {
        downloadId,
        wasActive,
      });
    } catch (error) {
      logger.error("[queue-manager] Failed to pause download", error as Error);
      throw error;
    }
  }

  /**
   * Resume a paused download
   */
  async resumeDownload(downloadId: string): Promise<void> {
    try {
      // Update status to queued - will be picked up by processor
      await updateDownloadStatus(this.db, downloadId, "queued", {
        pausedAt: null,
      });

      logger.info("[queue-manager] Resumed download", { downloadId });
    } catch (error) {
      logger.error(
        "[queue-manager] Failed to resume download",
        error as Error,
      );
      throw error;
    }
  }

  /**
   * Cancel a download
   */
  async cancelDownload(downloadId: string): Promise<void> {
    try {
      // Kill the download process if active
      const wasActive = killDownload(downloadId);

      // Update status to cancelled
      await updateDownloadStatus(this.db, downloadId, "cancelled", {
        cancelledAt: Date.now(),
      });

      logger.info("[queue-manager] Cancelled download", {
        downloadId,
        wasActive,
      });
    } catch (error) {
      logger.error(
        "[queue-manager] Failed to cancel download",
        error as Error,
      );
      throw error;
    }
  }

  /**
   * Retry a failed download
   */
  async retryDownload(downloadId: string): Promise<void> {
    try {
      // Get download record
      const [download] = await this.db
        .select()
        .from(downloads)
        .where(eq(downloads.id, downloadId))
        .execute();

      if (!download) {
        throw new Error(`Download ${downloadId} not found`);
      }

      // Check if retries exceeded
      const retryCount = download.retryCount ?? 0;
      const maxRetries = download.maxRetries ?? 3;

      if (retryCount >= maxRetries) {
        throw new Error("Max retries exceeded");
      }

      // Update status to queued
      await this.db
        .update(downloads)
        .set({
          status: "queued",
          retryCount: retryCount + 1,
          errorMessage: null,
          errorType: null,
          updatedAt: Date.now(),
        })
        .where(eq(downloads.id, downloadId));

      logger.info("[queue-manager] Retrying download", {
        downloadId,
        retryCount: retryCount + 1,
      });
    } catch (error) {
      logger.error("[queue-manager] Failed to retry download", error as Error);
      throw error;
    }
  }

  /**
   * Get queue status
   */
  async getQueueStatus(): Promise<QueueStatus> {
    try {
      const allDownloads = await loadQueueFromDatabase(this.db);

      // Categorize downloads
      const queued = allDownloads.filter((d) => d.status === "queued");
      const downloading = allDownloads.filter((d) => d.status === "downloading");
      const paused = allDownloads.filter((d) => d.status === "paused");

      // Get recent completed/failed
      const completed = await this.db
        .select()
        .from(downloads)
        .where(eq(downloads.status, "completed"))
        .orderBy(downloads.completedAt)
        .limit(10)
        .execute();

      const failed = await this.db
        .select()
        .from(downloads)
        .where(eq(downloads.status, "failed"))
        .orderBy(downloads.updatedAt)
        .limit(10)
        .execute();

      // Calculate stats
      const stats: QueueStats = {
        totalQueued: queued.length,
        totalActive: downloading.length,
        totalPaused: paused.length,
        totalCompleted: completed.length,
        totalFailed: failed.length,
        averageProgress:
          downloading.length > 0
            ? downloading.reduce((sum, d) => sum + d.progress, 0) /
              downloading.length
            : 0,
      };

      return {
        queued,
        downloading,
        paused,
        completed: completed.map((d) => ({
          id: d.id,
          url: d.url,
          videoId: d.videoId,
          title: d.videoId || "",
          channelTitle: null,
          thumbnailUrl: null,
          status: d.status,
          progress: d.progress || 0,
          priority: d.priority || 0,
          queuePosition: d.queuePosition,
          format: d.format,
          quality: d.quality,
          filePath: d.filePath,
          fileSize: d.fileSize,
          errorMessage: d.errorMessage,
          errorType: d.errorType,
          isRetryable: d.isRetryable ?? true,
          retryCount: d.retryCount || 0,
          maxRetries: d.maxRetries || 3,
          addedAt: d.createdAt,
          startedAt: null,
          pausedAt: d.pausedAt,
          completedAt: d.completedAt,
          cancelledAt: d.cancelledAt,
          updatedAt: d.updatedAt,
        })),
        failed: failed.map((d) => ({
          id: d.id,
          url: d.url,
          videoId: d.videoId,
          title: d.videoId || "",
          channelTitle: null,
          thumbnailUrl: null,
          status: d.status,
          progress: d.progress || 0,
          priority: d.priority || 0,
          queuePosition: d.queuePosition,
          format: d.format,
          quality: d.quality,
          filePath: d.filePath,
          fileSize: d.fileSize,
          errorMessage: d.errorMessage,
          errorType: d.errorType,
          isRetryable: d.isRetryable ?? true,
          retryCount: d.retryCount || 0,
          maxRetries: d.maxRetries || 3,
          addedAt: d.createdAt,
          startedAt: null,
          pausedAt: d.pausedAt,
          completedAt: d.completedAt,
          cancelledAt: d.cancelledAt,
          updatedAt: d.updatedAt,
        })),
        stats,
      };
    } catch (error) {
      logger.error("[queue-manager] Failed to get queue status", error as Error);
      throw error;
    }
  }

  /**
   * Clear completed downloads
   */
  async clearCompleted(): Promise<void> {
    try {
      await this.db
        .delete(downloads)
        .where(eq(downloads.status, "completed"))
        .execute();

      logger.info("[queue-manager] Cleared completed downloads");
    } catch (error) {
      logger.error(
        "[queue-manager] Failed to clear completed",
        error as Error,
      );
      throw error;
    }
  }
}

// Singleton instance
let queueManagerInstance: QueueManager | null = null;

/**
 * Get or create queue manager instance
 */
export const getQueueManager = (db: Database, config?: Partial<QueueConfig>): QueueManager => {
  if (!queueManagerInstance) {
    queueManagerInstance = new QueueManager(db, config);
  }
  return queueManagerInstance;
};

/**
 * Initialize and start queue manager
 */
export const initializeQueueManager = (db: Database, config?: Partial<QueueConfig>): QueueManager => {
  const manager = getQueueManager(db, config);
  if (config?.autoStart !== false) {
    manager.start();
  }
  return manager;
};
