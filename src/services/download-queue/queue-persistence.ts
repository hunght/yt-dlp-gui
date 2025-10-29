import { eq, or, inArray } from "drizzle-orm";
import { downloads, youtubeVideos } from "@/api/db/schema";
import type { Database } from "@/api/db";
import type { QueuedDownload, DownloadStatus } from "./types";
import { logger } from "@/helpers/logger";

/**
 * Load all queued and active downloads from database
 */
export const loadQueueFromDatabase = async (db: Database): Promise<QueuedDownload[]> => {
  try {
    const queuedDownloads = await db
      .select({
        id: downloads.id,
        url: downloads.url,
        videoId: downloads.videoId,
        status: downloads.status,
        progress: downloads.progress,
        priority: downloads.priority,
        queuePosition: downloads.queuePosition,
        format: downloads.format,
        quality: downloads.quality,
        filePath: downloads.filePath,
        fileSize: downloads.fileSize,
        errorMessage: downloads.errorMessage,
        errorType: downloads.errorType,
        isRetryable: downloads.isRetryable,
        retryCount: downloads.retryCount,
        maxRetries: downloads.maxRetries,
        createdAt: downloads.createdAt,
        updatedAt: downloads.updatedAt,
        completedAt: downloads.completedAt,
        pausedAt: downloads.pausedAt,
        cancelledAt: downloads.cancelledAt,
        title: youtubeVideos.title,
        channelTitle: youtubeVideos.channelTitle,
        thumbnailUrl: youtubeVideos.thumbnailUrl,
      })
      .from(downloads)
      .leftJoin(youtubeVideos, eq(downloads.videoId, youtubeVideos.videoId))
      .where(
        or(
          eq(downloads.status, "queued"),
          eq(downloads.status, "downloading"),
          eq(downloads.status, "paused")
        )
      );

    return queuedDownloads.map((d) => ({
      id: d.id,
      url: d.url,
      videoId: d.videoId,
      title: d.title || "Untitled",
      channelTitle: d.channelTitle,
      thumbnailUrl: d.thumbnailUrl,
      status: d.status as DownloadStatus,
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
      startedAt: d.status === "downloading" ? d.updatedAt : null,
      pausedAt: d.pausedAt,
      completedAt: d.completedAt,
      cancelledAt: d.cancelledAt,
      updatedAt: d.updatedAt,
    }));
  } catch (error) {
    logger.error("[queue-persistence] Failed to load queue from database", error as Error);
    return [];
  }
};

/**
 * Update download status in database
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
      .update(downloads)
      .set({
        status,
        updatedAt: now,
        ...additionalData,
      })
      .where(eq(downloads.id, downloadId));

    logger.debug("[queue-persistence] Updated download status", {
      downloadId,
      status,
      ...additionalData,
    });

    // Mirror status into youtube_videos consolidated fields
    try {
      const dl = await db
        .select({ videoId: downloads.videoId })
        .from(downloads)
        .where(eq(downloads.id, downloadId))
        .limit(1);
      const videoId = dl[0]?.videoId;
      if (videoId) {
        await db
          .update(youtubeVideos)
          .set({
            downloadStatus: status,
            downloadProgress: additionalData?.progress ?? undefined,
            downloadFilePath: additionalData?.filePath ?? undefined,
            downloadFileSize: additionalData?.fileSize ?? undefined,
            lastErrorMessage: additionalData?.errorMessage ?? undefined,
            errorType: additionalData?.errorType ?? undefined,
            lastDownloadedAt: additionalData?.completedAt ?? undefined,
            updatedAt: now,
          })
          .where(eq(youtubeVideos.videoId, videoId));
      }
    } catch (e) {
      logger.error("[queue-persistence] Failed to mirror status to youtube_videos", e as Error);
    }
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
      .update(downloads)
      .set({
        progress: Math.min(100, Math.max(0, progress)),
        updatedAt: Date.now(),
      })
      .where(eq(downloads.id, downloadId));

    // Mirror progress into youtube_videos consolidated fields
    try {
      const dl = await db
        .select({ videoId: downloads.videoId })
        .from(downloads)
        .where(eq(downloads.id, downloadId))
        .limit(1);
      const videoId = dl[0]?.videoId;
      if (videoId) {
        await db
          .update(youtubeVideos)
          .set({ downloadStatus: "downloading", downloadProgress: Math.round(progress), updatedAt: Date.now() })
          .where(eq(youtubeVideos.videoId, videoId));
      }
    } catch (e) {
      logger.error("[queue-persistence] Failed to mirror progress to youtube_videos", e as Error);
    }
  } catch (error) {
    logger.error("[queue-persistence] Failed to update download progress", error as Error);
  }
};

/**
 * Increment retry count for a download
 */
export const incrementRetryCount = async (
  db: Database,
  downloadId: string
): Promise<void> => {
  try {
    const existing = await db
      .select({ retryCount: downloads.retryCount })
      .from(downloads)
      .where(eq(downloads.id, downloadId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(downloads)
        .set({
          retryCount: (existing[0].retryCount || 0) + 1,
          updatedAt: Date.now(),
        })
        .where(eq(downloads.id, downloadId));
    }
  } catch (error) {
    logger.error("[queue-persistence] Failed to increment retry count", error as Error);
  }
};

/**
 * Update queue positions for all downloads
 */
export const updateQueuePositions = async (
  db: Database,
  queuedDownloads: Array<{ id: string; position: number }>
): Promise<void> => {
  try {
    // Update positions in batches
    for (const { id, position } of queuedDownloads) {
      await db
        .update(downloads)
        .set({
          queuePosition: position,
          updatedAt: Date.now(),
        })
        .where(eq(downloads.id, id));
    }

    logger.debug("[queue-persistence] Updated queue positions", {
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
      .select({
        id: downloads.id,
        url: downloads.url,
        videoId: downloads.videoId,
        status: downloads.status,
        progress: downloads.progress,
        priority: downloads.priority,
        queuePosition: downloads.queuePosition,
        format: downloads.format,
        quality: downloads.quality,
        filePath: downloads.filePath,
        fileSize: downloads.fileSize,
        errorMessage: downloads.errorMessage,
        errorType: downloads.errorType,
        isRetryable: downloads.isRetryable,
        retryCount: downloads.retryCount,
        maxRetries: downloads.maxRetries,
        createdAt: downloads.createdAt,
        updatedAt: downloads.updatedAt,
        completedAt: downloads.completedAt,
        pausedAt: downloads.pausedAt,
        cancelledAt: downloads.cancelledAt,
        title: youtubeVideos.title,
        channelTitle: youtubeVideos.channelTitle,
        thumbnailUrl: youtubeVideos.thumbnailUrl,
      })
      .from(downloads)
      .leftJoin(youtubeVideos, eq(downloads.videoId, youtubeVideos.videoId))
      .where(eq(downloads.status, "completed"))
      .limit(limit);

    return completed.map((d) => ({
      id: d.id,
      url: d.url,
      videoId: d.videoId,
      title: d.title || "Untitled",
      channelTitle: d.channelTitle,
      thumbnailUrl: d.thumbnailUrl,
      status: d.status as DownloadStatus,
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
      .select({ id: downloads.id, completedAt: downloads.completedAt })
      .from(downloads)
      .where(eq(downloads.status, "completed"));

    if (allCompleted.length > keepCount) {
      // Sort by completion date and keep most recent
      const sorted = allCompleted.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
      const toDelete = sorted.slice(keepCount).map((d) => d.id);

      if (toDelete.length > 0) {
        await db.delete(downloads).where(inArray(downloads.id, toDelete));
        logger.info("[queue-persistence] Cleaned up old completed downloads", {
          deleted: toDelete.length,
        });
      }
    }
  } catch (error) {
    logger.error("[queue-persistence] Failed to cleanup completed downloads", error as Error);
  }
};
