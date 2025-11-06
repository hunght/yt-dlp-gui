import { eq } from "drizzle-orm";
import { youtubeVideos } from "@/api/db/schema";
import type { Database } from "@/api/db";
import { DEFAULT_QUEUE_CONFIG } from "./config";
import type { QueueConfig, QueueStatus, QueueStats, QueuedDownload } from "./types";
import { spawnDownload, killDownload } from "./download-worker";
import { logger } from "@/helpers/logger";
import { app } from "electron";
import path from "path";

/**
 * In-memory queue item
 */
interface QueueItem {
  id: string;
  url: string;
  videoId: string | null;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  status: "queued" | "downloading" | "paused";
  progress: number;
  priority: number;
  queuePosition: number;
  format: string | null;
  quality: string | null;
  errorMessage: string | null;
  errorType: string | null;
  isRetryable: boolean;
  retryCount: number;
  maxRetries: number;
  addedAt: number;
  startedAt: number | null;
  pausedAt: number | null;
}

/**
 * Simple in-memory queue manager that processes downloads with max concurrent limit
 * Download state is synced to youtube_videos table for persistence
 */
class QueueManager {
  private db: Database;
  private config: QueueConfig;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  // In-memory queue storage
  private queue: Map<string, QueueItem> = new Map();

  constructor(db: Database, config: Partial<QueueConfig> = {}) {
    this.db = db;
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  /**
   * Update download progress (called by download-worker)
   */
  async updateProgress(
    downloadId: string,
    progress: number,
    metadata?: { title?: string; videoId?: string }
  ): Promise<void> {
    const item = this.queue.get(downloadId);
    if (!item) return;

    item.progress = progress;

    // Update metadata if provided
    if (metadata?.title) {
      item.title = metadata.title;
    }
    if (metadata?.videoId) {
      item.videoId = metadata.videoId;
    }

    // Sync progress to youtube_videos using known videoId (from metadata or existing item)
    const vid = metadata?.videoId ?? item.videoId;
    if (vid) {
      await this.db
        .update(youtubeVideos)
        .set({
          downloadStatus: "downloading",
          downloadProgress: progress,
          updatedAt: Date.now(),
        })
        .where(eq(youtubeVideos.videoId, vid))
        .execute();
    }
  }

  /**
   * Mark download as completed (called by download-worker)
   */
  async markCompleted(
    downloadId: string,
    filePath: string,
    fileSize?: number
  ): Promise<void> {
    const item = this.queue.get(downloadId);
    if (!item) return;

    // Remove from queue
    this.queue.delete(downloadId);

    // Sync to youtube_videos
    if (item.videoId) {
      await this.db
        .update(youtubeVideos)
        .set({
          downloadStatus: "completed",
          downloadProgress: 100,
          downloadFilePath: filePath,
          downloadFileSize: fileSize || null,
          lastDownloadedAt: Date.now(),
          updatedAt: Date.now(),
        })
        .where(eq(youtubeVideos.videoId, item.videoId))
        .execute();
    }

    logger.info("[queue-manager] Download completed", { downloadId, filePath });
  }

  /**
   * Mark download as failed (called by download-worker)
   */
  async markFailed(
    downloadId: string,
    errorMessage: string,
    errorType?: string
  ): Promise<void> {
    const item = this.queue.get(downloadId);
    if (!item) return;

    // Update error info
    item.errorMessage = errorMessage;
    item.errorType = errorType || "unknown";
    item.status = "paused"; // Paused so user can retry

    // Sync to youtube_videos
    if (item.videoId) {
      await this.db
        .update(youtubeVideos)
        .set({
          downloadStatus: "failed",
          lastErrorMessage: errorMessage,
          errorType: errorType || "unknown",
          isRetryable: true,
          updatedAt: Date.now(),
        })
        .where(eq(youtubeVideos.videoId, item.videoId))
        .execute();
    }

    logger.error("[queue-manager] Download failed", {
      downloadId,
      error: errorMessage,
    });
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
      // Count active downloads in memory
      const activeDownloads = Array.from(this.queue.values()).filter(
        (item) => item.status === "downloading"
      );
      const activeCount = activeDownloads.length;

      // Check if we can start more downloads
      const availableSlots = this.config.maxConcurrent - activeCount;
      if (availableSlots <= 0) {
        return; // All slots filled
      }

      // Get next queued downloads (sorted by priority desc, then queuePosition asc)
      const queuedDownloads = Array.from(this.queue.values())
        .filter((item) => item.status === "queued")
        .sort((a, b) => {
          if (a.priority !== b.priority) {
            return b.priority - a.priority; // Higher priority first
          }
          return a.queuePosition - b.queuePosition; // Lower position first
        })
        .slice(0, availableSlots);

      // Start each download
      for (const item of queuedDownloads) {
        try {
          // Get output path
          const downloadsRoot = path.join(app.getPath("downloads"), "yt-dlp-gui");
          const outputPath = path.join(downloadsRoot, "%(fulltitle)s [%(id)s].%(ext)s");

          // Update status to downloading
          item.status = "downloading";
          item.startedAt = Date.now();

          // Sync DB early to reflect downloading state
          if (item.videoId) {
            await this.db
              .update(youtubeVideos)
              .set({
                downloadStatus: "downloading",
                downloadProgress: 0,
                updatedAt: Date.now(),
              })
              .where(eq(youtubeVideos.videoId, item.videoId))
              .execute();
          }

          // Spawn download
          await spawnDownload(
            this.db,
            item.id,
            item.videoId,
            item.url,
            item.format,
            outputPath,
          );

          logger.info("[queue-manager] Started download", {
            id: item.id,
            url: item.url,
          });
        } catch (error) {
          logger.error(
            "[queue-manager] Failed to start download",
            error as Error,
          );
          // Mark as failed
          item.status = "paused";
          item.errorMessage = (error as Error).message;
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
    const skippedUrls: Array<{ url: string; reason: string; videoId: string | null }> = [];

    try {
      // Get current max queue position
      const positions = Array.from(this.queue.values()).map((item) => item.queuePosition);
      const maxPosition = positions.length > 0 ? Math.max(...positions) : 0;
      let position = maxPosition + 1;

      const now = Date.now();

      for (const url of urls) {
        // Try to extract videoId from URL
        const parseVideoId = (u: string): string | null => {
          try {
            const parsed = new URL(u);
            // watch?v=VIDEOID
            const vParam = parsed.searchParams.get("v");
            if (vParam) return vParam;
            // youtu.be/VIDEOID
            if (parsed.hostname.includes("youtu.be")) {
              const seg = parsed.pathname.split("/").filter(Boolean)[0];
              if (seg) return seg;
            }
            // shorts/VIDEOID or live/VIDEOID
            const parts = parsed.pathname.split("/").filter(Boolean);
            const idx = parts.findIndex((p) => p === "shorts" || p === "live");
            if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
            return null;
          } catch {
            return null;
          }
        };

        const videoId = parseVideoId(url);

        // Check for duplicates in database if we have a videoId
        if (videoId) {
          try {
            const existing = await this.db
              .select({
                id: youtubeVideos.id,
                videoId: youtubeVideos.videoId,
                title: youtubeVideos.title,
                downloadStatus: youtubeVideos.downloadStatus,
                downloadFilePath: youtubeVideos.downloadFilePath,
              })
              .from(youtubeVideos)
              .where(eq(youtubeVideos.videoId, videoId))
              .limit(1);

            if (existing.length > 0) {
              const video = existing[0];
              const status = video.downloadStatus;

              // Skip if already completed
              if (status === "completed") {
                logger.info("[queue-manager] Skipping duplicate - already downloaded", {
                  videoId,
                  title: video.title,
                  filePath: video.downloadFilePath,
                });
                skippedUrls.push({
                  url,
                  videoId,
                  reason: `Already downloaded: "${video.title}"`,
                });
                continue;
              }

              // Skip if currently downloading or queued
              if (status === "downloading" || status === "queued") {
                logger.info("[queue-manager] Skipping duplicate - already in progress", {
                  videoId,
                  title: video.title,
                  status,
                });
                skippedUrls.push({
                  url,
                  videoId,
                  reason: `Already ${status}: "${video.title}"`,
                });
                continue;
              }
            }
          } catch (dbError) {
            logger.warn("[queue-manager] Failed to check for duplicates", {
              videoId,
              error: dbError,
            });
            // Continue with adding to queue if DB check fails
          }
        }

        // Check for duplicates in current in-memory queue
        const inQueue = Array.from(this.queue.values()).find(
          (item) => item.videoId === videoId && videoId !== null,
        );
        if (inQueue) {
          logger.info("[queue-manager] Skipping duplicate - already in queue", {
            videoId,
            queueId: inQueue.id,
          });
          skippedUrls.push({
            url,
            videoId,
            reason: `Already in queue: "${inQueue.title}"`,
          });
          continue;
        }

        // Generate unique ID
        const id = `download-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // Create queue item in memory
        const queueItem: QueueItem = {
          id,
          url,
          videoId, // Best-effort parse from URL
          title: url, // Temp title until metadata is available
          channelTitle: null,
          thumbnailUrl: null,
          status: "queued",
          progress: 0,
          priority: options.priority ?? 0,
          queuePosition: position++,
          format: options.format ?? null,
          quality: options.quality ?? null,
          errorMessage: null,
          errorType: null,
          isRetryable: true,
          retryCount: 0,
          maxRetries: this.config.maxRetries,
          addedAt: now,
          startedAt: null,
          pausedAt: null,
        };

        this.queue.set(id, queueItem);
        downloadIds.push(id);
      }

      logger.info("[queue-manager] Added to queue", {
        added: downloadIds.length,
        skipped: skippedUrls.length,
        ids: downloadIds,
      });

      // Log skipped URLs for user feedback
      if (skippedUrls.length > 0) {
        logger.info("[queue-manager] Skipped duplicate URLs", {
          count: skippedUrls.length,
          details: skippedUrls,
        });
      }

      // Auto-start if configured
      if (this.config.autoStart && !this.isProcessing) {
        this.start();
      }

      // Return both added and skipped info
      if (skippedUrls.length > 0) {
        const error: any = new Error(
          skippedUrls.length === urls.length
            ? "All videos already downloaded or in queue"
            : `${skippedUrls.length} of ${urls.length} videos skipped (already downloaded or in queue)`,
        );
        error.skippedUrls = skippedUrls;
        error.addedIds = downloadIds;
        error.isPartialDuplicate = downloadIds.length > 0;
        throw error;
      }

      return downloadIds;
    } catch (error) {
      // Re-throw with additional context if it's our duplicate error
      if ((error as any).skippedUrls) {
        throw error;
      }
      logger.error("[queue-manager] Failed to add to queue", error as Error);
      throw error;
    }
  }

  /**
   * Pause a download
   */
  async pauseDownload(downloadId: string): Promise<void> {
    try {
      const item = this.queue.get(downloadId);
      if (!item) {
        throw new Error(`Download ${downloadId} not found in queue`);
      }

      // Kill the download process if active
      const wasActive = killDownload(downloadId);

      // Update status to paused
      item.status = "paused";
      item.pausedAt = Date.now();

      // Sync to database if video exists
      if (item.videoId) {
        await this.db
          .update(youtubeVideos)
          .set({
            downloadStatus: "paused",
            updatedAt: Date.now(),
          })
          .where(eq(youtubeVideos.videoId, item.videoId));
      }

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
      const item = this.queue.get(downloadId);
      if (!item) {
        throw new Error(`Download ${downloadId} not found in queue`);
      }

      // Update status to queued - will be picked up by processor
      item.status = "queued";
      item.pausedAt = null;

      // Sync to database if video exists
      if (item.videoId) {
        await this.db
          .update(youtubeVideos)
          .set({
            downloadStatus: "queued",
            updatedAt: Date.now(),
          })
          .where(eq(youtubeVideos.videoId, item.videoId));
      }

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
      const item = this.queue.get(downloadId);
      if (!item) {
        throw new Error(`Download ${downloadId} not found in queue`);
      }

      // Kill the download process if active
      const wasActive = killDownload(downloadId);

      // Remove from queue
      this.queue.delete(downloadId);

      // Sync to database if video exists
      if (item.videoId) {
        await this.db
          .update(youtubeVideos)
          .set({
            downloadStatus: "cancelled",
            updatedAt: Date.now(),
          })
          .where(eq(youtubeVideos.videoId, item.videoId));
      }

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
      const item = this.queue.get(downloadId);
      if (!item) {
        throw new Error(`Download ${downloadId} not found in queue`);
      }

      // Check if retries exceeded
      if (item.retryCount >= item.maxRetries) {
        throw new Error("Max retries exceeded");
      }

      // Update status to queued
      item.status = "queued";
      item.retryCount++;
      item.errorMessage = null;
      item.errorType = null;

      logger.info("[queue-manager] Retrying download", {
        downloadId,
        retryCount: item.retryCount,
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
      // Get all items from in-memory queue
      const allItems = Array.from(this.queue.values());

      // Categorize downloads
      const queued = allItems.filter((item) => item.status === "queued");
      const downloading = allItems.filter((item) => item.status === "downloading");
      const paused = allItems.filter((item) => item.status === "paused");

      // Get recent completed/failed from youtube_videos
      const completed = await this.db
        .select({
          videoId: youtubeVideos.videoId,
          title: youtubeVideos.title,
          channelTitle: youtubeVideos.channelTitle,
          thumbnailUrl: youtubeVideos.thumbnailUrl,
          filePath: youtubeVideos.downloadFilePath,
          lastDownloadedAt: youtubeVideos.lastDownloadedAt,
        })
        .from(youtubeVideos)
        .where(eq(youtubeVideos.downloadStatus, "completed"))
        .orderBy(youtubeVideos.lastDownloadedAt)
        .limit(10)
        .execute();

      const failed = await this.db
        .select({
          videoId: youtubeVideos.videoId,
          title: youtubeVideos.title,
          channelTitle: youtubeVideos.channelTitle,
          thumbnailUrl: youtubeVideos.thumbnailUrl,
          errorMessage: youtubeVideos.lastErrorMessage,
          errorType: youtubeVideos.errorType,
          updatedAt: youtubeVideos.updatedAt,
        })
        .from(youtubeVideos)
        .where(eq(youtubeVideos.downloadStatus, "failed"))
        .orderBy(youtubeVideos.updatedAt)
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
            ? downloading.reduce((sum, d) => sum + d.progress, 0) / downloading.length
            : 0,
      };

      // Convert QueueItem to QueuedDownload for response
      const mapToQueuedDownload = (item: QueueItem): QueuedDownload => ({
        id: item.id,
        url: item.url,
        videoId: item.videoId,
        title: item.title,
        channelTitle: item.channelTitle,
        thumbnailUrl: item.thumbnailUrl,
        status: item.status,
        progress: item.progress,
        priority: item.priority,
        queuePosition: item.queuePosition,
        format: item.format,
        quality: item.quality,
        filePath: null,
        fileSize: null,
        errorMessage: item.errorMessage,
        errorType: item.errorType,
        isRetryable: item.isRetryable,
        retryCount: item.retryCount,
        maxRetries: item.maxRetries,
        addedAt: item.addedAt,
        startedAt: item.startedAt,
        pausedAt: item.pausedAt,
        completedAt: null,
        cancelledAt: null,
        updatedAt: null,
      });

      return {
        queued: queued.map(mapToQueuedDownload),
        downloading: downloading.map(mapToQueuedDownload),
        paused: paused.map(mapToQueuedDownload),
        completed: completed.map((v) => ({
          id: `completed-${v.videoId}`,
          url: "",
          videoId: v.videoId,
          title: v.title,
          channelTitle: v.channelTitle,
          thumbnailUrl: v.thumbnailUrl,
          status: "completed" as const,
          progress: 100,
          priority: 0,
          queuePosition: null,
          format: null,
          quality: null,
          filePath: v.filePath,
          fileSize: null,
          errorMessage: null,
          errorType: null,
          isRetryable: false,
          retryCount: 0,
          maxRetries: 0,
          addedAt: v.lastDownloadedAt || Date.now(),
          startedAt: null,
          pausedAt: null,
          completedAt: v.lastDownloadedAt,
          cancelledAt: null,
          updatedAt: v.lastDownloadedAt,
        })),
        failed: failed.map((v) => ({
          id: `failed-${v.videoId}`,
          url: "",
          videoId: v.videoId,
          title: v.title,
          channelTitle: v.channelTitle,
          thumbnailUrl: v.thumbnailUrl,
          status: "failed" as const,
          progress: 0,
          priority: 0,
          queuePosition: null,
          format: null,
          quality: null,
          filePath: null,
          fileSize: null,
          errorMessage: v.errorMessage,
          errorType: v.errorType,
          isRetryable: true,
          retryCount: 0,
          maxRetries: 3,
          addedAt: v.updatedAt || Date.now(),
          startedAt: null,
          pausedAt: null,
          completedAt: null,
          cancelledAt: null,
          updatedAt: v.updatedAt,
        })),
        stats,
      };
    } catch (error) {
      logger.error("[queue-manager] Failed to get queue status", error as Error);
      throw error;
    }
  }

  /**
   * Clear completed downloads from youtube_videos
   */
  async clearCompleted(): Promise<void> {
    try {
      await this.db
        .update(youtubeVideos)
        .set({
          downloadStatus: null,
          downloadProgress: null,
          downloadFilePath: null,
          downloadFileSize: null,
          lastDownloadedAt: null,
          updatedAt: Date.now(),
        })
        .where(eq(youtubeVideos.downloadStatus, "completed"))
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
 * Get existing queue manager instance (throws if not initialized)
 */
export const requireQueueManager = (): QueueManager => {
  if (!queueManagerInstance) {
    throw new Error("QueueManager not initialized. Call initializeQueueManager first.");
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
