import { z } from "zod";
import { publicProcedure, t } from "../trpc";
import { eq, desc, asc, and, or, sql } from "drizzle-orm";
import { downloads, youtubeVideos } from "../db/schema";
import db from "../db";
import { logger } from "../../helpers/logger";
const YTDlpWrapModule = require("yt-dlp-wrap");
const YTDlpWrap = YTDlpWrapModule.default;
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import https from "https";

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(process.cwd(), "downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Store active downloads for progress tracking
const activeDownloads = new Map<string, { process: any; progress: number }>();

export const downloadRouter = t.router({
  // Get all downloads with pagination and filtering
  getDownloads: publicProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        status: z.enum(["pending", "downloading", "completed", "failed", "cancelled"]).optional(),
        sortBy: z.enum(["createdAt", "title", "status"]).default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ input }) => {
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
          case "title":
            orderByClause = sortOrder === "asc" ? asc(downloads.title) : desc(downloads.title);
            break;
          case "status":
            orderByClause = sortOrder === "asc" ? asc(downloads.status) : desc(downloads.status);
            break;
          default:
            orderByClause = desc(downloads.createdAt);
        }

        // Get total count for pagination
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(downloads)
          .where(whereClause);

        const totalCount = countResult[0]?.count || 0;

        // Get downloads
        const downloadsList = await db
          .select()
          .from(downloads)
          .where(whereClause)
          .orderBy(orderByClause)
          .limit(limit)
          .offset(offset);

        return {
          downloads: downloadsList,
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
    }),

  // Get a single download by ID
  getDownloadById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    try {
      const download = await db.select().from(downloads).where(eq(downloads.id, input.id)).limit(1);

      return download[0] || null;
    } catch (error) {
      logger.error("Failed to fetch download by ID:", error);
      throw error;
    }
  }),

  // Start a new download
  startDownload: publicProcedure
    .input(
      z.object({
        url: z.string().url("Invalid URL"),
        format: z
          .string()
          .optional()
          .default("best[height<=720]/best[height<=480]/best[height<=360]/best"),
        quality: z.string().optional(),
        outputPath: z.string().optional(),
        getVideoInfoFirst: z.boolean().default(true), // New option to get video info first
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { url, format, quality, outputPath, getVideoInfoFirst } = input;
        const downloadId = randomUUID();
        const timestamp = Date.now();

        // Get video info first if requested
        let videoInfo = null;
        if (getVideoInfoFirst) {
          try {
            const videoId = extractVideoId(url);
            if (videoId) {
              // Check if we already have video info in database
              const existingVideo = await db
                .select()
                .from(youtubeVideos)
                .where(eq(youtubeVideos.videoId, videoId))
                .limit(1);

              if (existingVideo.length > 0) {
                videoInfo = existingVideo[0];
                logger.info(`Using existing video info for ${videoId}: ${videoInfo.title}`);
              } else {
                // Get fresh video info
                const ytDlpWrap = new YTDlpWrap();
                const output = await ytDlpWrap.execPromise([url, "--dump-json"]);
                const freshVideoInfo = JSON.parse(output);

                // Download thumbnail if available
                let thumbnailPath = null;
                if (freshVideoInfo.thumbnail) {
                  thumbnailPath = await downloadThumbnail(freshVideoInfo.thumbnail, videoId);
                }

                // Save video info to database
                const videoData = {
                  id: randomUUID(),
                  videoId,
                  title: freshVideoInfo.title || "Unknown Title",
                  description: freshVideoInfo.description || null,
                  channelId: freshVideoInfo.channel_id || null,
                  channelTitle: freshVideoInfo.channel || freshVideoInfo.uploader || null,
                  durationSeconds: freshVideoInfo.duration || null,
                  viewCount: freshVideoInfo.view_count || null,
                  likeCount: freshVideoInfo.like_count || null,
                  thumbnailUrl: freshVideoInfo.thumbnail || null,
                  publishedAt: freshVideoInfo.upload_date
                    ? new Date(freshVideoInfo.upload_date).getTime()
                    : null,
                  tags: freshVideoInfo.tags ? JSON.stringify(freshVideoInfo.tags) : null,
                  raw: JSON.stringify(freshVideoInfo),
                  createdAt: Date.now(),
                };

                await db.insert(youtubeVideos).values(videoData);
                videoInfo = videoData;
                logger.info(`Video info saved for ${videoId}: ${videoInfo.title}`);
              }
            }
          } catch (error) {
            logger.warn(`Failed to get video info for ${url}, proceeding with download:`, error);
            // Continue with download even if we can't get video info
          }
        }

        // Create download record with video info if available
        await db.insert(downloads).values({
          id: downloadId,
          url,
          title: videoInfo?.title || null,
          status: "pending",
          progress: 0,
          format,
          quality,
          metadata: videoInfo ? JSON.stringify(videoInfo) : null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        // Start download in background
        setImmediate(async () => {
          try {
            await processDownload(downloadId, url, format, quality, outputPath);
          } catch (error) {
            logger.error(`Download ${downloadId} failed:`, error);
            await db
              .update(downloads)
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
          videoInfo: videoInfo
            ? {
                ...videoInfo,
                durationFormatted: formatDuration(videoInfo.durationSeconds),
              }
            : null,
        };
      } catch (error) {
        logger.error("Failed to start download:", error);
        throw error;
      }
    }),

  // Cancel a download
  cancelDownload: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const { id } = input;

        // Check if download is active
        const activeDownload = activeDownloads.get(id);
        if (activeDownload) {
          activeDownload.process.kill();
          activeDownloads.delete(id);
        }

        // Update status in database
        await db
          .update(downloads)
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
    .mutation(async ({ input }) => {
      try {
        const { id } = input;

        // Get download info to delete file if exists
        const download = await db.select().from(downloads).where(eq(downloads.id, id)).limit(1);

        if (download[0]?.filePath && fs.existsSync(download[0].filePath)) {
          fs.unlinkSync(download[0].filePath);
        }

        // Delete from database
        await db.delete(downloads).where(eq(downloads.id, id));

        return { success: true };
      } catch (error) {
        logger.error("Failed to delete download:", error);
        throw error;
      }
    }),

  // Get video info and save to database
  getVideoInfo: publicProcedure
    .input(z.object({ url: z.string().url("Invalid URL") }))
    .mutation(async ({ input }) => {
      try {
        const ytDlpWrap = new YTDlpWrap();

        // Get video info using yt-dlp
        const output = await ytDlpWrap.execPromise([input.url, "--dump-json"]);
        const videoInfo = JSON.parse(output);

        // Extract video ID from URL
        const videoId = extractVideoId(input.url);
        if (!videoId) {
          throw new Error("Could not extract video ID from URL");
        }

        // Download thumbnail if available
        let thumbnailPath = null;
        if (videoInfo.thumbnail) {
          thumbnailPath = await downloadThumbnail(videoInfo.thumbnail, videoId);
        }

        // Prepare video data for database
        const videoData = {
          id: randomUUID(),
          videoId,
          title: videoInfo.title || "Unknown Title",
          description: videoInfo.description || null,
          channelId: videoInfo.channel_id || null,
          channelTitle: videoInfo.channel || videoInfo.uploader || null,
          durationSeconds: videoInfo.duration || null,
          viewCount: videoInfo.view_count || null,
          likeCount: videoInfo.like_count || null,
          thumbnailUrl: videoInfo.thumbnail || null,
          publishedAt: videoInfo.upload_date ? new Date(videoInfo.upload_date).getTime() : null,
          tags: videoInfo.tags ? JSON.stringify(videoInfo.tags) : null,
          raw: JSON.stringify(videoInfo),
          createdAt: Date.now(),
        };

        // Save or update video info in database
        await db
          .insert(youtubeVideos)
          .values(videoData)
          .onConflictDoUpdate({
            target: youtubeVideos.videoId,
            set: {
              title: videoData.title,
              description: videoData.description,
              channelId: videoData.channelId,
              channelTitle: videoData.channelTitle,
              durationSeconds: videoData.durationSeconds,
              viewCount: videoData.viewCount,
              likeCount: videoData.likeCount,
              thumbnailUrl: videoData.thumbnailUrl,
              publishedAt: videoData.publishedAt,
              tags: videoData.tags,
              raw: videoData.raw,
              updatedAt: Date.now(),
            },
          });

        logger.info(`Video info saved for ${videoId}: ${videoData.title}`);

        return {
          success: true,
          videoInfo: {
            ...videoData,
            thumbnailPath,
            duration: videoData.durationSeconds,
            durationFormatted: formatDuration(videoData.durationSeconds),
          },
        };
      } catch (error) {
        logger.error("Failed to get video info:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  // Check if a video is accessible and downloadable
  checkVideoAccessibility: publicProcedure
    .input(z.object({ url: z.string().url("Invalid URL") }))
    .query(async ({ input }) => {
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
    }),

  // Get available formats for a URL
  getAvailableFormats: publicProcedure
    .input(z.object({ url: z.string().url("Invalid URL") }))
    .query(async ({ input }) => {
      try {
        const ytDlpWrap = new YTDlpWrap();
        // Use execPromise for Promise-based execution
        const result = await ytDlpWrap.execPromise([input.url, "--list-formats"]);
        return { success: true, formats: result };
      } catch (error) {
        logger.error("Failed to get available formats:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
      }
    }),

  // Retry a failed download
  retryDownload: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    try {
      const { id } = input;

      // Get the failed download
      const download = await db.select().from(downloads).where(eq(downloads.id, id)).limit(1);

      if (!download[0]) {
        throw new Error("Download not found");
      }

      if (download[0].status !== "failed") {
        throw new Error("Can only retry failed downloads");
      }

      // Check if the download is retryable
      if (download[0].isRetryable === false) {
        throw new Error(
          "This download cannot be retried. The video may be restricted or region-locked."
        );
      }

      // Reset download status
      await db
        .update(downloads)
        .set({
          status: "pending",
          progress: 0,
          errorMessage: null,
          errorType: null,
          isRetryable: true,
          updatedAt: Date.now(),
        })
        .where(eq(downloads.id, id));

      // Start download in background (video info should already be in database)
      setImmediate(async () => {
        try {
          await processDownload(
            id,
            download[0].url,
            download[0].format || "best",
            download[0].quality || undefined,
            undefined
          );
        } catch (error) {
          logger.error(`Retry download ${id} failed:`, error);
          await db
            .update(downloads)
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
  }),

  // Get download details with thumbnail info
  getDownloadDetails: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      try {
        const { id } = input;

        // Get download record
        const download = await db.select().from(downloads).where(eq(downloads.id, id)).limit(1);

        if (!download[0]) {
          throw new Error("Download not found");
        }

        // Get video info if available
        let videoInfo = null;
        if (download[0].metadata) {
          try {
            const metadata = JSON.parse(download[0].metadata);
            const videoId = extractVideoId(download[0].url);

            if (videoId) {
              // Check if we have video info in database
              const videoRecord = await db
                .select()
                .from(youtubeVideos)
                .where(eq(youtubeVideos.videoId, videoId))
                .limit(1);

              if (videoRecord[0]) {
                videoInfo = {
                  title: videoRecord[0].title,
                  channelTitle: videoRecord[0].channelTitle,
                  duration: videoRecord[0].durationSeconds,
                  viewCount: videoRecord[0].viewCount,
                  thumbnailUrl: videoRecord[0].thumbnailUrl,
                  thumbnailPath: videoRecord[0].thumbnailUrl
                    ? path.join(process.cwd(), "thumbnails", `${videoId}.jpg`)
                    : null,
                };
              }
            }
          } catch (error) {
            logger.warn("Failed to parse download metadata:", error);
          }
        }

        return {
          ...download[0],
          videoInfo,
        };
      } catch (error) {
        logger.error("Failed to get download details:", error);
        throw error;
      }
    }),

  // Get download statistics
  getDownloadStats: publicProcedure.query(async () => {
    try {
      const stats = await db
        .select({
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
  }),
});

// Background download processing function
async function processDownload(
  downloadId: string,
  url: string,
  format: string,
  quality?: string,
  outputPath?: string
) {
  const ytDlpWrap = new YTDlpWrap();
  const timestamp = Date.now();

  try {
    // Update status to downloading
    await db
      .update(downloads)
      .set({
        status: "downloading",
        updatedAt: timestamp,
      })
      .where(eq(downloads.id, downloadId));

    // Try to get video info, but don't fail if it doesn't work
    let title = "Unknown Title";
    let duration = 0;
    let metadata = null;

    try {
      // Use execPromise with --dump-json to get video info without format restrictions
      const output = await ytDlpWrap.execPromise([url, "--dump-json"]);
      const videoInfo = JSON.parse(output);

      title = videoInfo.title || "Unknown Title";
      duration = videoInfo.duration || 0;
      metadata = JSON.stringify(videoInfo);

      // Update with video info
      await db
        .update(downloads)
        .set({
          title,
          metadata,
          updatedAt: Date.now(),
        })
        .where(eq(downloads.id, downloadId));
    } catch (error) {
      logger.warn(`Failed to get video info for ${url}, proceeding with download:`, error);
      // Continue with download even if we can't get video info
    }

    // Prepare output path
    const finalOutputPath =
      outputPath || path.join(downloadsDir, `${title.replace(/[^a-zA-Z0-9]/g, "_")}.%(ext)s`);

    // Start download with intelligent format fallback handling
    // First, try to get available formats to build a smarter fallback list
    let availableFormats: string[] = [];
    try {
      const formatsOutput = await ytDlpWrap.execPromise([url, "--list-formats", "--no-warnings"]);
      // Extract format IDs from the output
      const lines = formatsOutput.split("\n");
      for (const line of lines) {
        const match = line.match(/^(\d+(?:-\d+)?)\s+/);
        if (match) {
          availableFormats.push(match[1]);
        }
      }
      logger.info(
        `Available formats for ${url}: ${availableFormats.slice(0, 10).join(", ")}${availableFormats.length > 10 ? "..." : ""}`
      );
    } catch (error) {
      logger.warn(`Could not get format list for ${url}, using default fallbacks`);
    }

    // Build format options with available formats first, then fallbacks
    const formatOptions = [
      format, // User's preferred format
      "bestaudio", // Audio-only (most likely to work for restricted videos)
      "best[height<=720]/best[height<=480]/best[height<=360]/best", // Fallback 1
      "best[height<=480]/best[height<=360]/best", // Fallback 2
      "best[height<=360]/best", // Fallback 3
      "best", // Fallback 4 - just best quality
      "worst", // Fallback 5 - worst quality (most likely to work)
      // Add available formats from the video
      ...availableFormats.slice(0, 5), // Try first 5 available formats
    ];

    let downloadProcess: any;
    let usedFormat = format;
    let downloadSuccessful = false;

    // Try each format option until one works
    for (const formatOption of formatOptions) {
      try {
        logger.info(`Trying format: ${formatOption} for download ${downloadId}`);

        // First, test if this format is available by doing a dry run
        try {
          await ytDlpWrap.execPromise([
            url,
            "-f",
            formatOption,
            "--simulate", // Dry run to test format availability
            "--no-warnings",
          ]);
        } catch (formatError) {
          logger.warn(
            `Format ${formatOption} not available for download ${downloadId}:`,
            formatError
          );
          continue; // Try next format
        }

        // If we get here, the format is available, so start the actual download
        const downloadArgs = [
          url,
          "-f",
          formatOption,
          "-o",
          finalOutputPath,
          "--progress",
          "--newline",
          "--no-warnings", // Suppress warnings for cleaner output
        ];

        // Start the download process
        downloadProcess = ytDlpWrap.exec(downloadArgs);
        usedFormat = formatOption;
        downloadSuccessful = true;
        break; // If we get here without error, this format works
      } catch (error) {
        logger.warn(`Format ${formatOption} failed for download ${downloadId}:`, error);
        // Continue to next format option
      }
    }

    if (!downloadSuccessful) {
      // Analyze the error to determine if it's retryable
      const errorAnalysis = analyzeDownloadError(formatOptions, url);

      // Update download record with error analysis
      await db
        .update(downloads)
        .set({
          status: "failed",
          errorMessage: errorAnalysis.message,
          errorType: errorAnalysis.type,
          isRetryable: errorAnalysis.retryable,
          updatedAt: Date.now(),
        })
        .where(eq(downloads.id, downloadId));

      throw new Error(errorAnalysis.message);
    }

    // Store active download
    activeDownloads.set(downloadId, { process: downloadProcess, progress: 0 });

    // Handle progress updates
    downloadProcess.on("progress", (progress: any) => {
      const progressPercent = Math.round(progress.percent || 0);
      activeDownloads.get(downloadId)!.progress = progressPercent;

      // Update progress in database
      db.update(downloads)
        .set({
          progress: progressPercent,
          updatedAt: Date.now(),
        })
        .where(eq(downloads.id, downloadId))
        .catch((error) => logger.error("Failed to update progress:", error));
    });

    // Wait for download to complete
    await new Promise<void>((resolve, reject) => {
      downloadProcess.on("close", (code: number | null) => {
        activeDownloads.delete(downloadId);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Download process exited with code ${code}`));
        }
      });

      downloadProcess.on("error", (error: Error) => {
        activeDownloads.delete(downloadId);
        reject(error);
      });
    });

    // Find the downloaded file - look for the most recently created file
    const files = fs.readdirSync(downloadsDir);
    let downloadedFile = null;

    if (title !== "Unknown Title") {
      // Try to find file by title first
      downloadedFile = files.find((file) => file.includes(title.replace(/[^a-zA-Z0-9]/g, "_")));
    }

    if (!downloadedFile) {
      // If we can't find by title, get the most recently created file
      const fileStats = files
        .map((file) => {
          const filePath = path.join(downloadsDir, file);
          try {
            const stats = fs.statSync(filePath);
            return { file, stats, mtime: stats.mtime.getTime() };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => b!.mtime - a!.mtime);

      if (fileStats.length > 0) {
        downloadedFile = fileStats[0]!.file;
      }
    }

    if (downloadedFile) {
      const filePath = path.join(downloadsDir, downloadedFile);
      const stats = fs.statSync(filePath);

      // Update with completion info
      await db
        .update(downloads)
        .set({
          status: "completed",
          progress: 100,
          filePath,
          fileSize: stats.size,
          format: usedFormat, // Update with the format that actually worked
          completedAt: Date.now(),
          updatedAt: Date.now(),
        })
        .where(eq(downloads.id, downloadId));
    } else {
      throw new Error("Downloaded file not found");
    }
  } catch (error) {
    activeDownloads.delete(downloadId);
    throw error;
  }
}

// Helper function to extract video ID from YouTube URL
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// Helper function to download thumbnail
async function downloadThumbnail(thumbnailUrl: string, videoId: string): Promise<string | null> {
  try {
    const thumbnailsDir = path.join(process.cwd(), "thumbnails");
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    }

    const thumbnailPath = path.join(thumbnailsDir, `${videoId}.jpg`);

    // Skip if thumbnail already exists
    if (fs.existsSync(thumbnailPath)) {
      return thumbnailPath;
    }

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(thumbnailPath);

      https
        .get(thumbnailUrl, (response) => {
          if (response.statusCode === 200) {
            response.pipe(file);
            file.on("finish", () => {
              file.close();
              logger.info(`Thumbnail downloaded: ${thumbnailPath}`);
              resolve(thumbnailPath);
            });
          } else {
            file.close();
            fs.unlinkSync(thumbnailPath);
            reject(new Error(`Failed to download thumbnail: ${response.statusCode}`));
          }
        })
        .on("error", (error) => {
          file.close();
          fs.unlinkSync(thumbnailPath);
          reject(error);
        });
    });
  } catch (error) {
    logger.warn(`Failed to download thumbnail for ${videoId}:`, error);
    return null;
  }
}

// Helper function to format duration in seconds to human readable format
function formatDuration(seconds: number | null): string {
  if (!seconds) return "Unknown";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
}

// Helper function to analyze download errors and determine if retryable
function analyzeDownloadError(
  formatOptions: string[],
  url: string
): {
  type: "restricted" | "network" | "format" | "unknown";
  retryable: boolean;
  message: string;
} {
  // Check if this is a YouTube URL
  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");

  if (isYouTube) {
    // For YouTube videos, most errors are due to restrictions
    return {
      type: "restricted",
      retryable: false,
      message:
        "This video is restricted or region-locked. It may not be available in your region or may have download restrictions. Try using a VPN or check if the video is publicly accessible.",
    };
  }

  // For other platforms, check if it's a format issue
  if (formatOptions.length > 3) {
    // If we tried many formats, it's likely a format issue
    return {
      type: "format",
      retryable: true,
      message:
        "No suitable format found for this video. The video may have unusual format restrictions. You can try again later or contact support.",
    };
  }

  // Default to network issue (retryable)
  return {
    type: "network",
    retryable: true,
    message:
      "Download failed due to network issues. Please check your internet connection and try again.",
  };
}
