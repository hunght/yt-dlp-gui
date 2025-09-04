import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { eq } from "drizzle-orm";
import { downloads } from "../db/schema";
import { logger } from "../../helpers/logger";

const YTDlpWrapModule = require("yt-dlp-wrap");
const YTDlpWrap = YTDlpWrapModule.default;

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
  quality,
  outputPath,
  outputFilename,
  outputFormat,
  db: database,
}: {
  downloadId: string;
  url: string;
  format: string;
  quality?: string;
  outputPath?: string;
  outputFilename?: string;
  outputFormat?: "default" | "mp4" | "mp3";
  db: any;
}) {
  const ytDlpWrap = new YTDlpWrap();
  const timestamp = Date.now();

  try {
    // Get existing download record to retrieve title and metadata
    const existingDownload = await database
      .select()
      .from(downloads)
      .where(eq(downloads.id, downloadId))
      .limit(1);

    const downloadRecord = existingDownload[0];
    if (!downloadRecord) {
      throw new Error(`Download record not found for ID: ${downloadId}`);
    }

    // Use existing title and metadata from database
    const title = downloadRecord.title || "Unknown Title";
    const metadata = downloadRecord.metadata;

    // Update status to downloading
    await database
      .update(downloads)
      .set({
        status: "downloading",
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

    // Use the user's selected format or default to "best"
    const formatOptions = [format || "best"];

    let downloadProcess: any;
    let usedFormat = format || "best";
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

        // Add merge output format if specified (for mp4/mp3)
        if (outputFormat && outputFormat !== "default") {
          downloadArgs.push("--merge-output-format", outputFormat);
        }

        // Start the download process
        downloadProcess = ytDlpWrap.exec(downloadArgs);
        usedFormat = formatOption;
        downloadSuccessful = true;
        break; // If we get here without error, this format works
      } catch (error) {
        logger.warn(`Format ${formatOption} failed for download ${downloadId}:`, error);

        // Check if this is a 403 Forbidden error - if so, don't try other formats
        if (error instanceof Error && error.message.includes("HTTP Error 403: Forbidden")) {
          logger.error(`Video is restricted or region-locked. Cannot download with any format.`);
          break; // Stop trying other formats
        }

        // Continue to next format option
      }
    }

    if (!downloadSuccessful) {
      // Analyze the error to determine if it's retryable
      const errorAnalysis = analyzeDownloadError(formatOptions, url);

      // Update download record with error analysis
      await database
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
