import { spawn } from "child_process";
import { app } from "electron";
import path from "path";
import { requireQueueManager } from "./queue-manager";
import type { Database } from "@/api/db";
import type { WorkerState } from "./types";
import fs from "fs";
import { logger } from "@/helpers/logger";

/**
 * Active download workers
 * Maps download ID to worker state
 */
const activeWorkers = new Map<string, WorkerState>();

/**
 * Get yt-dlp binary filename based on platform
 */
const getYtDlpAssetName = (platform: NodeJS.Platform): string => {
  switch (platform) {
    case "win32":
      return "yt-dlp.exe";
    case "darwin":
      return "yt-dlp_macos";
    default:
      return "yt-dlp";
  }
};

/**
 * Get yt-dlp binary path
 */
const getYtDlpPath = (): string => {
  const binDir = path.join(app.getPath("userData"), "bin");
  return path.join(binDir, getYtDlpAssetName(process.platform));
};

/**
 * Spawn a download worker for a queued item
 */
export const spawnDownload = async (
  db: Database,
  downloadId: string,
  videoId: string | null,
  url: string,
  format: string | null,
  outputPath: string,
): Promise<void> => {
  try {
    // Check if already downloading
    if (activeWorkers.has(downloadId)) {
      logger.warn(`Download already active`, { downloadId });
      return;
    }

      // Status will be updated by queue manager before calling this function

    // Get yt-dlp binary path
    const ytDlpPath = getYtDlpPath();

    // Build yt-dlp command arguments
    const args = [
      url,
      "--newline", // Output progress on new lines
      "--no-playlist", // Don't download playlists
      "-o",
      outputPath,
    ];

    // Add format if specified
    if (format) {
      args.push("-f", format);
    }

    // Spawn yt-dlp process
    const process = spawn(ytDlpPath, args);

    // Store worker state
    const worker: WorkerState = {
      downloadId,
      process,
      startTime: Date.now(),
      lastProgressUpdate: Date.now(),
      lastKnownFilePath: undefined,
      outputDir: path.dirname(outputPath),
      videoId,
    };
    activeWorkers.set(downloadId, worker);

    // Handle stdout - parse progress and file path
    process.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      parseProgressAndMetadata(db, downloadId, output);
    });

    // Handle stderr - log errors
    process.stderr?.on("data", (data: Buffer) => {
      const errorOutput = data.toString();
      logger.debug("[download-worker] yt-dlp stderr output", { downloadId, output: errorOutput });
    });

    // Handle process completion
    process.on("close", async (code: number | null) => {
      activeWorkers.delete(downloadId);

      if (code === 0) {
        // Success
          const queueManager = requireQueueManager();
          // Determine final path: prefer parsed, else search by [videoId]
          const w = worker;
          let finalPath: string | null = w.lastKnownFilePath ?? null;
          if (!finalPath && w.videoId && w.outputDir && fs.existsSync(w.outputDir)) {
            try {
              const files = fs.readdirSync(w.outputDir);
              const match = files.find((f) => f.includes(`[${w.videoId}]`));
              if (match) finalPath = path.join(w.outputDir, match);
            } catch {}
          }
          await queueManager.markCompleted(downloadId, finalPath || outputPath);
        logger.info("[download-worker] Download completed successfully", { downloadId, finalPath: finalPath || outputPath });
      } else {
        // Failed
          const queueManager = requireQueueManager();
          await queueManager.markFailed(
            downloadId,
            `yt-dlp exited with code ${code}`,
            "process_error"
          );
        logger.error("[download-worker] Download failed", { downloadId, exitCode: code });
      }
    });

    // Handle process errors
    process.on("error", async (error: Error) => {
      activeWorkers.delete(downloadId);
        const queueManager = requireQueueManager();
        await queueManager.markFailed(downloadId, error.message, "spawn_error");
      logger.error("[download-worker] Download process error", error as Error, { downloadId });
    });
  } catch (error) {
    activeWorkers.delete(downloadId);
      const queueManager = requireQueueManager();
      await queueManager.markFailed(
        downloadId,
        error instanceof Error ? error.message : "Unknown error",
        "spawn_error"
      );
    logger.error("[download-worker] Failed to spawn download", error as Error, { downloadId });
  }
};

/**
 * Parse progress and metadata from yt-dlp output
 */
const parseProgressAndMetadata = (db: Database, downloadId: string, output: string): void => {
  // Look for progress percentage: "[download]  45.3% of 10.5MiB at 1.2MiB/s"
  const progressMatch = output.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);

  if (progressMatch) {
    const progress = parseFloat(progressMatch[1]);

    // Update progress in database (throttled)
    const worker = activeWorkers.get(downloadId);
    if (worker) {
      const now = Date.now();
      // Update at most every 500ms
      if (now - worker.lastProgressUpdate >= 500) {
        worker.lastProgressUpdate = now;
        const queueManager = requireQueueManager();
        queueManager.updateProgress(downloadId, Math.round(progress)).catch((err: Error) =>
          logger.error("[download-worker] Failed to update progress", err, { downloadId })
        );
      }
    }
  }

  // Look for destination/merged file path
  // Example: [download] Destination: /path/to/file.mp4
  const destMatch = output.match(/\[download\]\s+Destination:\s+(.+)/);
  // Example: [Merger] Merging formats into "/path/to/file.mp4"
  const mergeMatch = output.match(/\[Merger\]\s+Merging formats into\s+"(.+?)"/);

  const foundPath = destMatch?.[1] || mergeMatch?.[1];
  if (foundPath) {
    const worker = activeWorkers.get(downloadId);
    if (worker) {
      // Normalize quotes and whitespace
      const cleaned = foundPath.replace(/^"|"$/g, "").trim();
      (worker as any).lastKnownFilePath = cleaned;
    }
  }
};

/**
 * Kill a download worker
 */
export const killDownload = (downloadId: string): boolean => {
  const worker = activeWorkers.get(downloadId);
  if (worker?.process) {
    worker.process.kill("SIGTERM");
    activeWorkers.delete(downloadId);
    return true;
  }
  return false;
};
