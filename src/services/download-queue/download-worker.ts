import { spawn } from "child_process";
import { app } from "electron";
import path from "path";
import {
  updateDownloadStatus,
  updateDownloadProgress,
} from "./queue-persistence";
import type { Database } from "@/api/db";
import type { WorkerState } from "./types";

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
  url: string,
  format: string | null,
  outputPath: string,
): Promise<void> => {
  try {
    // Check if already downloading
    if (activeWorkers.has(downloadId)) {
      console.warn(`Download ${downloadId} is already active`);
      return;
    }

    // Update status to downloading
    await updateDownloadStatus(db, downloadId, "downloading");

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
    };
    activeWorkers.set(downloadId, worker);

    // Handle stdout - parse progress
    process.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      parseProgress(db, downloadId, output);
    });

    // Handle stderr - log errors
    process.stderr?.on("data", (data: Buffer) => {
      console.error(`[${downloadId}] yt-dlp error:`, data.toString());
    });

    // Handle process completion
    process.on("close", async (code: number | null) => {
      activeWorkers.delete(downloadId);

      if (code === 0) {
        // Success
        await updateDownloadStatus(db, downloadId, "completed", {
          completedAt: Date.now(),
          progress: 100,
        });
        console.log(`Download ${downloadId} completed successfully`);
      } else {
        // Failed
        await updateDownloadStatus(db, downloadId, "failed", {
          errorMessage: `yt-dlp exited with code ${code}`,
          errorType: "unknown",
        });
        console.error(`Download ${downloadId} failed with code ${code}`);
      }
    });

    // Handle process errors
    process.on("error", async (error: Error) => {
      activeWorkers.delete(downloadId);
      await updateDownloadStatus(db, downloadId, "failed", {
        errorMessage: error.message,
        errorType: "unknown",
      });
      console.error(`Download ${downloadId} error:`, error);
    });
  } catch (error) {
    activeWorkers.delete(downloadId);
    await updateDownloadStatus(db, downloadId, "failed", {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorType: "unknown",
    });
    console.error(`Failed to spawn download ${downloadId}:`, error);
  }
};

/**
 * Parse progress from yt-dlp output
 */
const parseProgress = (db: Database, downloadId: string, output: string): void => {
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
        updateDownloadProgress(db, downloadId, Math.round(progress)).catch((err) =>
          console.error(`Failed to update progress for ${downloadId}:`, err),
        );
      }
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

/**
 * Check if a download is currently active
 */
export const isDownloadActive = (downloadId: string): boolean => {
  return activeWorkers.has(downloadId);
};

/**
 * Get all active download IDs
 */
export const getActiveDownloadIds = (): string[] => {
  return Array.from(activeWorkers.keys());
};

/**
 * Kill all active downloads
 */
export const killAllDownloads = (): void => {
  for (const worker of activeWorkers.values()) {
    worker.process?.kill("SIGTERM");
  }
  activeWorkers.clear();
};
