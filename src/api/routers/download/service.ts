import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { eq } from "drizzle-orm";
import { downloads, YoutubeVideo, youtubeVideos } from "@/api/db/schema";
import { logger } from "@/helpers/logger";
import { ProcessDownloadParams, formatToYtDlpSelector } from "./types";
import { Database } from "@/api/db";

const YTDlpWrapModule = require("yt-dlp-wrap");
const YTDlpWrap = YTDlpWrapModule.default;

// Shared internal function for getting video info
export const getVideoInfoInternal = async ({
  url,
  db,
}: {
  url: string;
  db: Database;
}): Promise<{
  success: boolean;
  videoInfo?: YoutubeVideo;
  error?: string;
}> => {
  try {
    // Extract video ID from URL first
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error("Could not extract video ID from URL");
    }

    // Check if video already exists in database
    const existingVideo = await db
      .select()
      .from(youtubeVideos)
      .where(eq(youtubeVideos.videoId, videoId))
      .get();

    if (existingVideo) {
      return {
        success: true,
        videoInfo: existingVideo,
      };
    }

    // Video doesn't exist, fetch from yt-dlp
    const ytDlpWrap = new YTDlpWrap();
    const output = await ytDlpWrap.execPromise([url, "--dump-json"]);
    const videoInfo = JSON.parse(output);

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
      thumbnailPath: thumbnailPath,
      publishedAt: videoInfo.upload_date
        ? (() => {
            const date = new Date(videoInfo.upload_date);
            return isNaN(date.getTime()) ? null : date.getTime();
          })()
        : null,
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
          thumbnailPath: videoData.thumbnailPath,
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
        updatedAt: Date.now(),
      },
    };
  } catch (error) {
    logger.error("Failed to get video info:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
// Create downloads directory if it doesn't exist
export const downloadsDir = path.join(process.cwd(), "downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Store active downloads for progress tracking
export const activeDownloads = new Map<string, { process: any; progress: number }>();

// Helper function to extract video ID from YouTube URL
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

// Helper function to download thumbnail
export async function downloadThumbnail(
  thumbnailUrl: string,
  videoId: string
): Promise<string | null> {
  try {
    const thumbnailsDir = path.join(process.cwd(), "thumbnails");
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    }

    const thumbnailPath = path.join(thumbnailsDir, `${videoId}.jpg`);

    // Download thumbnail using fetch
    const response = await fetch(thumbnailUrl);
    if (!response.ok) {
      throw new Error(`Failed to download thumbnail: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(thumbnailPath, Buffer.from(buffer));

    return thumbnailPath;
  } catch (error) {
    logger.error("Failed to download thumbnail:", error);
    return null;
  }
}

// Helper function to format duration in seconds to human readable format
export function formatDuration(seconds: number | null): string {
  if (!seconds) return "Unknown";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
}

// Helper function to analyze download errors
export function analyzeDownloadError(
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

// Background download processing function
export async function processDownload({
  downloadId,
  url,
  format,
  outputPath,
  outputFilename,
  outputFormat,
  db: database,
}: ProcessDownloadParams) {
  const ytDlpWrap = new YTDlpWrap();
  const timestamp = Date.now();

  try {
    // Get existing download record
    const existingDownload = await database
      .select()
      .from(downloads)
      .where(eq(downloads.id, downloadId))
      .limit(1);

    const downloadRecord = existingDownload[0];
    if (!downloadRecord) {
      throw new Error(`Download record not found for ID: ${downloadId}`);
    }

    // Extract video ID from URL for filename generation
    const videoId = extractVideoId(url);
    const title = videoId ? `video_${videoId}` : "Unknown Title";

    // Update status to downloading and set videoId if available
    await database
      .update(downloads)
      .set({
        status: "downloading",
        videoId: videoId,
        updatedAt: timestamp,
      })
      .where(eq(downloads.id, downloadId));

    // Prepare output path
    let finalOutputPath;
    if (outputPath) {
      finalOutputPath = outputPath;
    } else if (outputFilename) {
      // Use the custom filename template from frontend
      finalOutputPath = path.join(downloadsDir, outputFilename);
    } else {
      // Fallback to default naming
      finalOutputPath = path.join(downloadsDir, `${title.replace(/[^a-zA-Z0-9]/g, "_")}.%(ext)s`);
    }

    // Convert enum format to yt-dlp format selector using shared helper
    const selectedFormat = format ? formatToYtDlpSelector(format) : "";

    if (selectedFormat) {
      logger.info(`Using format: ${selectedFormat} for download ${downloadId}`);
    } else {
      logger.info(`Using default format selection for download ${downloadId}`);
    }

    // Start the actual download
    const downloadArgs = [url];

    // Add format option only if format is specified
    if (selectedFormat) {
      downloadArgs.push("-f", selectedFormat);
    }

    downloadArgs.push(
      "-o",
      finalOutputPath,
      "--progress",
      "--newline",
      "--no-warnings" // Suppress warnings for cleaner output
    );

    // Add output format options based on format type
    if (outputFormat && outputFormat !== "default") {
      // For audio formats (mp3, aac, opus, flac), use --audio-format
      const audioFormats = ["mp3", "aac", "opus", "flac"];
      if (audioFormats.includes(outputFormat)) {
        downloadArgs.push("--extract-audio", "--audio-format", outputFormat);
      } else {
        // For video formats (mp4, webm, mkv), use --merge-output-format
        downloadArgs.push("--merge-output-format", outputFormat);
      }
    }

    // Log the exact command that will be executed

    logger.info(
      `Full yt-dlp command: yt-dlp ${downloadArgs.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ")}`
    );

    // Start the download process
    const downloadProcess = ytDlpWrap.exec(downloadArgs);

    if (!downloadProcess) {
      throw new Error("Failed to start download process");
    }

    // Store active download
    activeDownloads.set(downloadId, { process: downloadProcess, progress: 0 });

    // Handle progress updates
    downloadProcess.on("progress", (progress: any) => {
      const progressPercent = Math.round(progress.percent || 0);
      logger.info(`Download ${downloadId} progress: ${progressPercent}%`);
      activeDownloads.get(downloadId)!.progress = progressPercent;

      // Update progress in database
      database
        .update(downloads)
        .set({
          progress: progressPercent,
          updatedAt: Date.now(),
        })
        .where(eq(downloads.id, downloadId))
        .catch((error: any) => logger.error("Failed to update progress:", error));
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
      await database
        .update(downloads)
        .set({
          status: "completed",
          progress: 100,
          filePath,
          fileSize: stats.size,
          format: selectedFormat || "default", // Update with the format that was used or "default"
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
