import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import defaultDb from "@/api/db";
import { getQueueManager } from "@/services/download-queue/queue-manager";

// Initialize queue manager singleton
const queueManager = getQueueManager(defaultDb);

/**
 * Queue router - handles download queue operations
 * UI polls these endpoints with React Query
 */
export const queueRouter = t.router({
  /**
   * Add URLs to download queue
   */
  addToQueue: publicProcedure
    .input(
      z.object({
        urls: z.array(z.string().url()),
        priority: z.number().optional().default(0),
        format: z.string().optional(),
        quality: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        logger.info("[queue] Adding to queue", {
          count: input.urls.length,
          priority: input.priority,
        });

        const downloadIds = await queueManager.addToQueue(input.urls, {
          priority: input.priority,
          format: input.format,
          quality: input.quality,
        });

        return {
          success: true,
          downloadIds,
          message: `Added ${downloadIds.length} download(s) to queue`,
        };
      } catch (error) {
        // Handle duplicate detection errors
        const err = error as any;
        if (err.skippedUrls && Array.isArray(err.skippedUrls)) {
          const skippedDetails = err.skippedUrls
            .map((item: any) => item.reason)
            .join(", ");

          logger.warn("[queue] Some URLs skipped due to duplicates", {
            skipped: err.skippedUrls.length,
            added: err.addedIds?.length || 0,
          });

          return {
            success: err.isPartialDuplicate ? true : false,
            downloadIds: err.addedIds || [],
            message: err.message,
            skippedUrls: err.skippedUrls,
            details: skippedDetails,
          };
        }

        logger.error("[queue] Failed to add to queue", error as Error);
        return {
          success: false,
          downloadIds: [],
          message: error instanceof Error ? error.message : "Failed to add to queue",
        };
      }
    }),

  /**
   * Get queue status - UI polls this endpoint
   */
  getQueueStatus: publicProcedure.query(async () => {
    try {
      const status = await queueManager.getQueueStatus();
      return {
        success: true,
        data: status,
      };
    } catch (error) {
      logger.error("[queue] Failed to get queue status", error as Error);
      return {
        success: false,
        data: null,
        message: error instanceof Error ? error.message : "Failed to get queue status",
      };
    }
  }),

  /**
   * Pause a download
   */
  pauseDownload: publicProcedure
    .input(
      z.object({
        downloadId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        logger.info("[queue] Pausing download", { downloadId: input.downloadId });
        await queueManager.pauseDownload(input.downloadId);
        return {
          success: true,
          message: "Download paused",
        };
      } catch (error) {
        logger.error("[queue] Failed to pause download", error as Error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to pause download",
        };
      }
    }),

  /**
   * Resume a paused download
   */
  resumeDownload: publicProcedure
    .input(
      z.object({
        downloadId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        logger.info("[queue] Resuming download", { downloadId: input.downloadId });
        await queueManager.resumeDownload(input.downloadId);
        return {
          success: true,
          message: "Download resumed",
        };
      } catch (error) {
        logger.error("[queue] Failed to resume download", error as Error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to resume download",
        };
      }
    }),

  /**
   * Cancel a download
   */
  cancelDownload: publicProcedure
    .input(
      z.object({
        downloadId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        logger.info("[queue] Cancelling download", { downloadId: input.downloadId });
        await queueManager.cancelDownload(input.downloadId);
        return {
          success: true,
          message: "Download cancelled",
        };
      } catch (error) {
        logger.error("[queue] Failed to cancel download", error as Error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to cancel download",
        };
      }
    }),

  /**
   * Retry a failed download
   */
  retryDownload: publicProcedure
    .input(
      z.object({
        downloadId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        logger.info("[queue] Retrying download", { downloadId: input.downloadId });
        await queueManager.retryDownload(input.downloadId);
        return {
          success: true,
          message: "Download queued for retry",
        };
      } catch (error) {
        logger.error("[queue] Failed to retry download", error as Error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to retry download",
        };
      }
    }),

  /**
   * Clear completed downloads
   */
  clearCompleted: publicProcedure.mutation(async () => {
    try {
      logger.info("[queue] Clearing completed downloads");
      await queueManager.clearCompleted();
      return {
        success: true,
        message: "Completed downloads cleared",
      };
    } catch (error) {
      logger.error("[queue] Failed to clear completed", error as Error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to clear completed downloads",
      };
    }
  }),

  /**
   * Start the queue processor
   */
  startQueue: publicProcedure.mutation(async () => {
    try {
      logger.info("[queue] Starting queue processor");
      queueManager.start();
      return {
        success: true,
        message: "Queue processor started",
      };
    } catch (error) {
      logger.error("[queue] Failed to start queue", error as Error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to start queue",
      };
    }
  }),

  /**
   * Stop the queue processor
   */
  stopQueue: publicProcedure.mutation(async () => {
    try {
      logger.info("[queue] Stopping queue processor");
      queueManager.stop();
      return {
        success: true,
        message: "Queue processor stopped",
      };
    } catch (error) {
      logger.error("[queue] Failed to stop queue", error as Error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to stop queue",
      };
    }
  }),
});

// Router type not exported (unused)
