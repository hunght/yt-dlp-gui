import { eq, or, inArray } from "drizzle-orm";
import { youtubeVideos } from "@/api/db/schema";
import type { Database } from "@/api/db";
import type { QueuedDownload, DownloadStatus } from "./types";
import { logger } from "@/helpers/logger";

/**
 * Load all queued and active downloads from database
 * Note: downloads table has been merged into youtube_videos
 */
export const loadQueueFromDatabase = async (db: Database): Promise<QueuedDownload[]> => {
  try {
    const queuedDownloads = await db
      .select()
      .from(youtubeVideos)
      .where(
        or(
          eq(youtubeVideos.downloadStatus, "queued"),
          eq(youtubeVideos.downloadStatus, "downloading"),
          eq(youtubeVideos.downloadStatus, "paused")
        )
      );

    return queuedDownloads.map((video) => ({
      id: video.id,
      url: `https://youtube.com/watch?v=${video.videoId}`,
      videoId: video.videoId,
      title: video.title || "Untitled",
      channelTitle: video.channelTitle,
      thumbnailUrl: video.thumbnailUrl,
      status: (video.downloadStatus as DownloadStatus) || "pending",
      progress: video.downloadProgress || 0,
      priority: 0, // Default priority
      queuePosition: null,
      format: video.downloadFormat,
      quality: video.downloadQuality,
      filePath: video.downloadFilePath,
      fileSize: video.downloadFileSize,
      errorMessage: video.lastErrorMessage,
      errorType: video.errorType,
      isRetryable: video.isRetryable ?? true,
      retryCount: 0, // No longer tracked separately
      maxRetries: 3,
      addedAt: video.createdAt,
      startedAt: video.downloadStatus === "downloading" ? video.updatedAt : null,
      pausedAt: null,
      completedAt: video.lastDownloadedAt,
      cancelledAt: null,
      updatedAt: video.updatedAt,
    }));
  } catch (error) {
    logger.error("[queue-persistence] Failed to load queue from database", error as Error);
    return [];
  }
};


/**
 * Update download status in database
 * Note: downloads table has been merged into youtube_videos
 */
export const updateDownloadStatus = async (
  db: Database,
  downloadId: string,
  status: DownloadStatus,
  additionalData?: {
    progress?: number;
    errorMessage?: string;
    errorType?: string;
    filePath?: string;
    fileSize?: number;
    pausedAt?: number | null;
    completedAt?: number | null;
    cancelledAt?: number | null;
  }
): Promise<void> => {
  try {
    const now = Date.now();
    await db
      .update(youtubeVideos)
      .set({
        downloadStatus: status,
        downloadProgress: additionalData?.progress,
        downloadFilePath: additionalData?.filePath,
        downloadFileSize: additionalData?.fileSize,
        lastErrorMessage: additionalData?.errorMessage,
        errorType: additionalData?.errorType,
        lastDownloadedAt: additionalData?.completedAt,
        updatedAt: now,
      })
      .where(eq(youtubeVideos.id, downloadId));

    logger.debug("[queue-persistence] Updated download status", {
      downloadId,
      status,
      ...additionalData,
    });
  } catch (error) {
    logger.error("[queue-persistence] Failed to update download status", error as Error);
    throw error;
  }
};

/**
 * Update download progress in database
 */
export const updateDownloadProgress = async (
  db: Database,
  downloadId: string,
  progress: number
): Promise<void> => {
  try {
    await db
      .update(youtubeVideos)
      .set({
        downloadStatus: "downloading",
        downloadProgress: Math.min(100, Math.max(0, Math.round(progress))),
        updatedAt: Date.now(),
      })
      .where(eq(youtubeVideos.id, downloadId));
  } catch (error) {
    logger.error("[queue-persistence] Failed to update download progress", error as Error);
  }
};

/**
 * Increment retry count for a download
 * Note: retry count is no longer tracked in the merged table
 */
export const incrementRetryCount = async (
  db: Database,
  downloadId: string
): Promise<void> => {
  try {
    // Retry count tracking removed - just log
    logger.debug("[queue-persistence] Retry count increment (no-op in merged table)", {
      downloadId,
    });
  } catch (error) {
    logger.error("[queue-persistence] Failed to increment retry count", error as Error);
  }
};

/**
 * Update queue positions for all downloads
 * Note: queue position is no longer tracked in the merged table
 */
export const updateQueuePositions = async (
  db: Database,
  queuedDownloads: Array<{ id: string; position: number }>
): Promise<void> => {
  try {
    // Queue position tracking removed - just log
    logger.debug("[queue-persistence] Queue position update (no-op in merged table)", {
      count: queuedDownloads.length,
    });
  } catch (error) {
    logger.error("[queue-persistence] Failed to update queue positions", error as Error);
  }
};

/**
 * Get completed downloads with limit
 */
export const getCompletedDownloads = async (
  db: Database,
  limit: number = 50
): Promise<QueuedDownload[]> => {
  try {
    const completed = await db
      .select()
      .from(youtubeVideos)
      .where(eq(youtubeVideos.downloadStatus, "completed"))
      .limit(limit);

    return completed.map((video) => ({
      id: video.id,
      url: `https://youtube.com/watch?v=${video.videoId}`,
      videoId: video.videoId,
      title: video.title || "Untitled",
      channelTitle: video.channelTitle,
      thumbnailUrl: video.thumbnailUrl,
      status: "completed" as DownloadStatus,
      progress: video.downloadProgress || 100,
      priority: 0,
      queuePosition: null,
      format: video.downloadFormat,
      quality: video.downloadQuality,
      filePath: video.downloadFilePath,
      fileSize: video.downloadFileSize,
      errorMessage: video.lastErrorMessage,
      errorType: video.errorType,
      isRetryable: video.isRetryable ?? true,
      retryCount: 0,
      maxRetries: 3,
      addedAt: video.createdAt,
      startedAt: null,
      pausedAt: null,
      completedAt: video.lastDownloadedAt,
      cancelledAt: null,
      updatedAt: video.updatedAt,
    }));
  } catch (error) {
    logger.error("[queue-persistence] Failed to get completed downloads", error as Error);
    return [];
  }
};

/**
 * Clean up old completed downloads
 */
export const cleanupCompletedDownloads = async (
  db: Database,
  keepCount: number = 100
): Promise<void> => {
  try {
    const allCompleted = await db
      .select({ id: youtubeVideos.id, lastDownloadedAt: youtubeVideos.lastDownloadedAt })
      .from(youtubeVideos)
      .where(eq(youtubeVideos.downloadStatus, "completed"));

    if (allCompleted.length > keepCount) {
      // Sort by completion date and keep most recent
      const sorted = allCompleted.sort((a, b) => (b.lastDownloadedAt || 0) - (a.lastDownloadedAt || 0));
      const toDelete = sorted.slice(keepCount).map((d) => d.id);

      if (toDelete.length > 0) {
        // Instead of deleting, just clear the download status
        await db
          .update(youtubeVideos)
          .set({
            downloadStatus: null,
            downloadProgress: null,
            downloadFilePath: null,
            downloadFileSize: null,
          })
          .where(inArray(youtubeVideos.id, toDelete));

        logger.info("[queue-persistence] Cleaned up old completed downloads", {
          cleared: toDelete.length,
        });
      }
    }
  } catch (error) {
    logger.error("[queue-persistence] Failed to cleanup completed downloads", error as Error);
  }
};

