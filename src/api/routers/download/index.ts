import {
  processDownload,
  extractVideoId,
  downloadThumbnail,
  activeDownloads,
  formatDuration,
  getVideoInfoInternal,
} from "./service";
import {
  startDownloadInputSchema,
  getDownloadsInputSchema,
  DownloadFormat,
  OutputFormat,
} from "./types";
import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { downloads, youtubeVideos, YoutubeVideo } from "@/api/db/schema";
import { logger } from "@/helpers/logger";

const YTDlpWrapModule = require("yt-dlp-wrap");
const YTDlpWrap = YTDlpWrapModule.default;
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { readFileSync } from "fs";
import { DownloadWithVideo, DownloadStatus } from "@/api/types";

export const downloadRouter = t.router({
  // Get all downloads with pagination and filtering
  getDownloads: publicProcedure.input(getDownloadsInputSchema).query(
    async ({
      input,
      ctx,
    }): Promise<{
      downloads: DownloadWithVideo[];
      pagination: {
        page: number;
        limit: number;
        totalCount: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
      };
    }> => {
      try {
        const { page, limit, status, sortBy, sortOrder } = input;
        const offset = (page - 1) * limit;

        // Build where conditions
        const whereConditions = [];
        if (status) {
          whereConditions.push(eq(downloads.status, status));
        }

        const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

        // Build order by clause
        let orderByClause;
        switch (sortBy) {
          case "createdAt":
            orderByClause =
              sortOrder === "asc" ? asc(downloads.createdAt) : desc(downloads.createdAt);
            break;
          case "videoId":
            orderByClause = sortOrder === "asc" ? asc(downloads.videoId) : desc(downloads.videoId);
            break;
          case "status":
            orderByClause = sortOrder === "asc" ? asc(downloads.status) : desc(downloads.status);
            break;
          default:
            orderByClause = desc(downloads.createdAt);
        }

        // Get total count for pagination
        const countResult = await ctx
          .db!.select({ count: sql<number>`count(*)` })
          .from(downloads)
          .where(whereClause);

        const totalCount = countResult[0]?.count || 0;

        // Get downloads with video information using leftJoin (following Drizzle docs pattern)
        const downloadsList = await ctx
          .db!.select()
          .from(downloads)
          .leftJoin(youtubeVideos, eq(downloads.videoId, youtubeVideos.videoId))
          .where(whereClause)
          .orderBy(orderByClause)
          .limit(limit)
          .offset(offset);

        // Transform to match DownloadInfo type - add formatted duration when video exists
        const downloadsWithVideoInfo = downloadsList.map((row) => ({
          ...row,
          video: row.youtube_videos
            ? {
                ...row.youtube_videos,
              }
            : null,
        }));

        return {
          downloads: downloadsWithVideoInfo,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            hasNextPage: page < Math.ceil(totalCount / limit),
            hasPrevPage: page > 1,
          },
        };
      } catch (error) {
        logger.error("Failed to fetch downloads:", error);
        throw error;
      }
    }
  ),

  // Get a single download by ID
  getDownloadById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }): Promise<DownloadWithVideo | null> => {
      try {
        const result = await ctx
          .db!.select()
          .from(downloads)
          .leftJoin(alias(youtubeVideos, "video"), eq(downloads.videoId, youtubeVideos.videoId))
          .where(eq(downloads.id, input.id))
          .get();

        if (!result) return null;

        return result;
      } catch (error) {
        logger.error("Failed to fetch download by ID:", error);
        throw error;
      }
    }),

  // Start a new download
  startDownload: publicProcedure.input(startDownloadInputSchema).mutation(
    async ({
      input,
      ctx,
    }): Promise<{
      id: string;
      status: DownloadStatus;
      videoInfo: YoutubeVideo | null;
    }> => {
      try {
        const { url, format, outputPath, outputFilename, outputFormat } = input;
        const downloadId = randomUUID();
        const timestamp = Date.now();

        // Get video info first (reuse existing logic)
        const { videoInfo } = await getVideoInfoInternal({ url, db: ctx.db! });
        if (!videoInfo) {
          throw new Error("Failed to retrieve video information");
        }
        // Create download record with video ID
        await ctx.db!.insert(downloads).values({
          id: downloadId,
          url,
          videoId: videoInfo.id,
          status: "pending",
          progress: 0,
          format,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        // Start download in background
        setImmediate(async () => {
          try {
            await processDownload({
              downloadId,
              url,
              format: format,
              outputPath,
              outputFilename,
              outputFormat,
              db: ctx.db!,
            });
          } catch (error) {
            logger.error(`Download ${downloadId} failed:`, error);

            // Log detailed error information for debugging
            logger.error(`Failed download details:`, {
              downloadId,
              url,
              format,
              outputPath,
              outputFilename,
              outputFormat,
              errorMessage: error instanceof Error ? error.message : "Unknown error",
              errorStack: error instanceof Error ? error.stack : undefined,
            });

            await ctx
              .db!.update(downloads)
              .set({
                status: "failed",
                errorMessage: error instanceof Error ? error.message : "Unknown error",
                updatedAt: Date.now(),
              })
              .where(eq(downloads.id, downloadId));
          }
        });

        return {
          id: downloadId,
          status: "pending",
          videoInfo: videoInfo,
        };
      } catch (error) {
        logger.error("Failed to start download:", error);
        throw error;
      }
    }
  ),

  // Cancel a download
  cancelDownload: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }): Promise<{ success: boolean }> => {
      try {
        const { id } = input;

        // Check if download is active
        const activeDownload = activeDownloads.get(id);
        if (activeDownload) {
          activeDownload.process.kill();
          activeDownloads.delete(id);
        }

        // Update status in database
        await ctx
          .db!.update(downloads)
          .set({
            status: "cancelled",
            updatedAt: Date.now(),
          })
          .where(eq(downloads.id, id));

        return { success: true };
      } catch (error) {
        logger.error("Failed to cancel download:", error);
        throw error;
      }
    }),

  // Delete a download record
  deleteDownload: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }): Promise<{ success: boolean }> => {
      try {
        const { id } = input;

        // Get download info to delete file if exists
        const download = await ctx
          .db!.select()
          .from(downloads)
          .where(eq(downloads.id, id))
          .limit(1);

        if (download[0]?.filePath && fs.existsSync(download[0].filePath)) {
          fs.unlinkSync(download[0].filePath);
        }

        // Delete from database
        await ctx.db!.delete(downloads).where(eq(downloads.id, id));

        return { success: true };
      } catch (error) {
        logger.error("Failed to delete download:", error);
        throw error;
      }
    }),

  // Get video info and save to database
  getVideoInfo: publicProcedure
    .input(z.object({ url: z.string().url("Invalid URL") }))
    .mutation(async ({ input, ctx }) => {
      return getVideoInfoInternal({ url: input.url, db: ctx.db! });
    }),

  // Check if a video is accessible and downloadable
  checkVideoAccessibility: publicProcedure
    .input(z.object({ url: z.string().url("Invalid URL") }))
    .query(
      async ({
        input,
      }): Promise<{
        success: boolean;
        accessible: boolean;
        downloadable?: boolean;
        videoInfo?: {
          title: string;
          duration: number;
          uploader: string;
          viewCount?: number;
          thumbnail?: string;
        };
        formats?: any;
        message?: string;
        error?: string;
        details?: string;
      }> => {
        try {
          const ytDlpWrap = new YTDlpWrap();

          // First, try to get basic video info
          let videoInfo = null;
          try {
            const output = await ytDlpWrap.execPromise([input.url, "--dump-json"]);
            videoInfo = JSON.parse(output);
          } catch (error) {
            return {
              success: false,
              accessible: false,
              error: "Video not accessible - may be private, deleted, or region-locked",
              details: error instanceof Error ? error.message : "Unknown error",
            };
          }

          // Then, try to get available formats
          let formats = null;
          try {
            const formatsOutput = await ytDlpWrap.execPromise([
              input.url,
              "--list-formats",
              "--no-warnings",
            ]);
            formats = formatsOutput;
          } catch (error) {
            return {
              success: false,
              accessible: false,
              error: "Video accessible but no downloadable formats available",
              details: error instanceof Error ? error.message : "Unknown error",
              videoInfo: {
                title: videoInfo.title,
                duration: videoInfo.duration,
                uploader: videoInfo.uploader,
              },
            };
          }

          // Test if we can actually download (simulate)
          let downloadable = false;
          const testFormats = ["bestaudio", "best[height<=720]", "best"];

          for (const format of testFormats) {
            try {
              await ytDlpWrap.execPromise([input.url, "-f", format, "--simulate", "--no-warnings"]);
              downloadable = true;
              break;
            } catch (error) {
              // Continue to next format
            }
          }

          return {
            success: true,
            accessible: true,
            downloadable,
            videoInfo: {
              title: videoInfo.title,
              duration: videoInfo.duration,
              uploader: videoInfo.uploader,
              viewCount: videoInfo.view_count,
              thumbnail: videoInfo.thumbnail,
            },
            formats: formats,
            message: downloadable
              ? "Video is accessible and downloadable"
              : "Video is accessible but may have download restrictions",
          };
        } catch (error) {
          logger.error("Failed to check video accessibility:", error);
          return {
            success: false,
            accessible: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      }
    ),

  // Get available formats for a URL
  getAvailableFormats: publicProcedure
    .input(z.object({ url: z.string().url("Invalid URL") }))
    .query(
      async ({
        input,
      }): Promise<{
        success: boolean;
        formats?: string;
        error?: string;
      }> => {
        try {
          const ytDlpWrap = new YTDlpWrap();
          // Use execPromise for Promise-based execution
          const result = await ytDlpWrap.execPromise([input.url, "--list-formats"]);
          return { success: true, formats: result };
        } catch (error) {
          logger.error("Failed to get available formats:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      }
    ),

  // Retry a failed download
  retryDownload: publicProcedure.input(z.object({ id: z.string() })).mutation(
    async ({
      input,
      ctx,
    }): Promise<{
      success: boolean;
      message: string;
    }> => {
      try {
        const { id } = input;

        // Get the failed download
        const download = await ctx.db!.select().from(downloads).where(eq(downloads.id, id)).get();

        if (!download) {
          throw new Error("Download not found");
        }

        if (download.status !== "failed") {
          throw new Error("Can only retry failed downloads");
        }

        // Check if the download is retryable
        if (download.isRetryable === false) {
          throw new Error(
            "This download cannot be retried. The video may be restricted or region-locked."
          );
        }

        // Reset download status
        await ctx
          .db!.update(downloads)
          .set({
            status: "pending",
            progress: 0,
            errorMessage: null,
            errorType: null,
            isRetryable: true,
            updatedAt: Date.now(),
          })
          .where(eq(downloads.id, id));

        setImmediate(async () => {
          try {
            await processDownload({
              downloadId: id,
              url: download.url,
              format: download.format as
                | "best"
                | "best720p"
                | "best480p"
                | "best1080p"
                | "audioonly"
                | "mp4best"
                | "webmbest"
                | undefined,
              outputPath: undefined,
              outputFilename: undefined,
              outputFormat: undefined, // Not stored in retry, use default
              db: ctx.db!,
            });
          } catch (error) {
            logger.error(`Retry download ${id} failed:`, error);
            await ctx
              .db!.update(downloads)
              .set({
                status: "failed",
                errorMessage: error instanceof Error ? error.message : "Unknown error",
                updatedAt: Date.now(),
              })
              .where(eq(downloads.id, id));
          }
        });

        return { success: true, message: "Download retry started" };
      } catch (error) {
        logger.error("Failed to retry download:", error);
        throw error;
      }
    }
  ),

  // Get download details with thumbnail info
  getDownloadDetails: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }): Promise<DownloadWithVideo> => {
      try {
        const { id } = input;

        // Get download record with video info using join
        const result = await ctx
          .db!.select()
          .from(downloads)
          .leftJoin(alias(youtubeVideos, "video"), eq(downloads.videoId, youtubeVideos.videoId))
          .where(eq(downloads.id, id))
          .get();

        if (!result) {
          throw new Error("Download not found");
        }

        return result;
      } catch (error) {
        logger.error("Failed to get download details:", error);
        throw error;
      }
    }),

  // Get download statistics
  getDownloadStats: publicProcedure.query(
    async ({
      ctx,
    }): Promise<{
      totalDownloads: number;
      completedDownloads: number;
      failedDownloads: number;
      pendingDownloads: number;
      downloadingDownloads: number;
      totalFileSize: number;
    }> => {
      try {
        const stats = await ctx
          .db!.select({
            totalDownloads: sql<number>`count(*)`,
            completedDownloads: sql<number>`count(case when status = 'completed' then 1 end)`,
            failedDownloads: sql<number>`count(case when status = 'failed' then 1 end)`,
            pendingDownloads: sql<number>`count(case when status = 'pending' then 1 end)`,
            downloadingDownloads: sql<number>`count(case when status = 'downloading' then 1 end)`,
            totalFileSize: sql<number>`sum(case when file_size is not null then file_size else 0 end)`,
          })
          .from(downloads);

        return (
          stats[0] || {
            totalDownloads: 0,
            completedDownloads: 0,
            failedDownloads: 0,
            pendingDownloads: 0,
            downloadingDownloads: 0,
            totalFileSize: 0,
          }
        );
      } catch (error) {
        logger.error("Failed to fetch download statistics:", error);
        throw error;
      }
    }
  ),

  // Convert image file to data URL
  convertImageToDataUrl: publicProcedure
    .input(
      z.object({
        imagePath: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        // Read the image file
        const imageBuffer = readFileSync(input.imagePath);

        // Get file extension to determine MIME type
        const ext = input.imagePath.split(".").pop()?.toLowerCase();
        let mimeType = "image/jpeg"; // default

        switch (ext) {
          case "png":
            mimeType = "image/png";
            break;
          case "gif":
            mimeType = "image/gif";
            break;
          case "webp":
            mimeType = "image/webp";
            break;
          case "svg":
            mimeType = "image/svg+xml";
            break;
          case "jpg":
          case "jpeg":
          default:
            mimeType = "image/jpeg";
            break;
        }

        // Convert to base64 data URL
        const base64 = imageBuffer.toString("base64");
        return `data:${mimeType};base64,${base64}`;
      } catch (error) {
        logger.error("Failed to convert image to data URL:", error);
        throw new Error(`Failed to convert image to data URL: ${error}`);
      }
    }),
});
