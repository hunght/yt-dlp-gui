import * as FileSystemLegacy from "expo-file-system/legacy";
import { Paths } from "expo-file-system";
import { api } from "./api";
import {
  createSafVideoFile,
  ensureSafVideosDirectory,
  findSafVideoFile,
  getVideoStorageLocation,
} from "./storage-location";
import type { VideoMeta, Transcript } from "../types";

// Custom AbortError for React Native (DOMException doesn't exist)
class AbortError extends Error {
  name = "AbortError";
  constructor(message = "Download cancelled") {
    super(message);
  }
}

const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);
  if (data) {
    console.log(`[${timestamp}] [Downloader] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [Downloader] ${message}`);
  }
};

function getVideosDirUri(): string {
  const documentDirectory = FileSystemLegacy.documentDirectory;
  if (!documentDirectory) {
    throw new Error("Document directory is not available");
  }
  return `${documentDirectory}videos`;
}

export function getVideoFileUri(videoId: string): string | null {
  try {
    return `${getVideosDirUri()}/${videoId}.mp4`;
  } catch {
    return null;
  }
}

/**
 * Get the current local path for a video file.
 * This resolves the path dynamically to handle sandbox container changes.
 */
export function getVideoLocalPath(videoId: string): string | null {
  const videoUri = getVideoFileUri(videoId);
  if (!videoUri) return null;

  try {
    const info = Paths.info(videoUri);
    return info.exists && info.isDirectory === false ? videoUri : null;
  } catch {
    return null;
  }
}

/**
 * Check if a video exists locally.
 */
export function videoExistsLocally(videoId: string): boolean {
  return getVideoLocalPath(videoId) !== null;
}

export async function ensureVideosDir(): Promise<string> {
  const videosDirUri = getVideosDirUri();
  const info = await FileSystemLegacy.getInfoAsync(videosDirUri);
  if (!info.exists) {
    await FileSystemLegacy.makeDirectoryAsync(videosDirUri, {
      intermediates: true,
    });
  }
  return videosDirUri;
}

export interface DownloadProgress {
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
}

export async function downloadVideo(
  serverUrl: string,
  videoId: string,
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<{ videoPath: string; meta: VideoMeta; transcripts: Transcript[] }> {
  await ensureVideosDir();
  const storageLocation = await getVideoStorageLocation();
  const internalVideoFileUri = getVideoFileUri(videoId);
  if (!internalVideoFileUri) {
    throw new Error("Video directory is not available");
  }

  const isExternalStorage = storageLocation.kind === "saf" && !!storageLocation.directoryUri;
  const videoFileUri = isExternalStorage
    ? `${internalVideoFileUri}.download`
    : internalVideoFileUri;
  const videoUrl = api.getVideoFileUrl(serverUrl, videoId);

  log(`Starting download: ${videoUrl}`);
  log(`Destination: ${isExternalStorage ? storageLocation.label : videoFileUri}`);

  // Signal that download is starting
  onProgress({ progress: 0, bytesDownloaded: 0, totalBytes: 0 });

  // Check if already aborted
  if (signal?.aborted) {
    throw new AbortError();
  }

  try {
    // Use legacy FileSystem API for downloading with progress
    const downloadResumable = FileSystemLegacy.createDownloadResumable(
      videoUrl,
      videoFileUri,
      {},
      (downloadProgress) => {
        const progress = Math.round(
          (downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite) *
            100
        );
        onProgress({
          progress,
          bytesDownloaded: downloadProgress.totalBytesWritten,
          totalBytes: downloadProgress.totalBytesExpectedToWrite,
        });
      }
    );

    // Set up abort handler
    let abortHandler: (() => void) | undefined;
    if (signal) {
      abortHandler = () => {
        log(`Download aborted: ${videoId}`);
        downloadResumable.pauseAsync().catch(() => {
          // Ignore pause errors during abort
        });
      };
      signal.addEventListener("abort", abortHandler);
    }

    try {
      const result = await downloadResumable.downloadAsync();

      // Check if aborted during download
      if (signal?.aborted) {
        await cleanupPartialDownload(videoId);
        throw new AbortError();
      }

      if (!result || result.status !== 200) {
        // 202 means desktop is re-downloading the file
        if (result?.status === 202) {
          throw new Error(
            "Video file missing on desktop - download queued. Please try again later."
          );
        }
        throw new Error(
          `Download failed: ${result?.status || "unknown error"}`
        );
      }

      let finalVideoUri = result.uri;

      if (isExternalStorage && storageLocation.directoryUri) {
        const videosDirUri = await ensureSafVideosDirectory(storageLocation.directoryUri);
        const existingUri = await findSafVideoFile(videosDirUri, videoId);
        if (existingUri) {
          await FileSystemLegacy.StorageAccessFramework.deleteAsync(existingUri, {
            idempotent: true,
          });
        }
        const externalVideoUri = await createSafVideoFile(videosDirUri, videoId);
        await FileSystemLegacy.StorageAccessFramework.copyAsync({
          from: result.uri,
          to: externalVideoUri,
        });
        await FileSystemLegacy.deleteAsync(result.uri, { idempotent: true });
        finalVideoUri = externalVideoUri;
      }

      log(`Download complete: ${finalVideoUri}`);
      onProgress({
        progress: 100,
        bytesDownloaded: result.headers?.["content-length"]
          ? parseInt(result.headers["content-length"])
          : 0,
        totalBytes: result.headers?.["content-length"]
          ? parseInt(result.headers["content-length"])
          : 0,
      });

      // Fetch video metadata and all transcripts in parallel
      const [meta, transcripts] = await Promise.all([
        api.getVideoMeta(serverUrl, videoId),
        api.getVideoTranscripts(serverUrl, videoId),
      ]);
      log(
        `Metadata fetched for: ${videoId}, transcripts: ${transcripts.length} languages`
      );
      // Debug: log transcript details
      for (const t of transcripts) {
        log(`  Transcript: lang=${t.language}, segments=${t.segments?.length ?? 0}`);
      }
      if (meta.transcript) {
        log(
          `  Meta transcript: lang=${meta.transcript.language}, segments=${meta.transcript.segments?.length ?? 0}`
        );
      }

      return {
        videoPath: finalVideoUri,
        meta,
        transcripts,
      };
    } finally {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  } catch (error) {
    // Clean up partial download on error (unless it's an abort)
    const isAbortError =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"));
    if (!isAbortError) {
      await cleanupPartialDownload(videoId).catch(() => {
        // Ignore cleanup errors
      });
    }
    log(`Download error:`, error);
    throw error;
  }
}

export async function cleanupPartialDownload(videoId: string): Promise<void> {
  const videoFileUri = getVideoFileUri(videoId);
  const tempFileUri = videoFileUri ? `${videoFileUri}.download` : null;

  try {
    if (videoFileUri) {
      const videoInfo = await FileSystemLegacy.getInfoAsync(videoFileUri);
      if (videoInfo.exists) {
        await FileSystemLegacy.deleteAsync(videoFileUri, { idempotent: true });
        log(`Cleaned up partial download: ${videoFileUri}`);
      }
    }
    if (tempFileUri) {
      const tempInfo = await FileSystemLegacy.getInfoAsync(tempFileUri);
      if (tempInfo.exists) {
        await FileSystemLegacy.deleteAsync(tempFileUri, { idempotent: true });
        log(`Cleaned up temp file: ${tempFileUri}`);
      }
    }
  } catch (error) {
    log(`Cleanup error:`, error);
  }
}

export async function deleteVideo(videoId: string): Promise<void> {
  const videoFileUri = getVideoFileUri(videoId);
  if (!videoFileUri) return;

  const info = await FileSystemLegacy.getInfoAsync(videoFileUri);
  if (info.exists) {
    await FileSystemLegacy.deleteAsync(videoFileUri, { idempotent: true });
  }
}

export async function getStorageInfo(): Promise<{
  used: number;
  videoCount: number;
}> {
  const videosDirUri = await ensureVideosDir();
  const files = await FileSystemLegacy.readDirectoryAsync(videosDirUri);
  let totalSize = 0;
  let videoCount = 0;

  for (const item of files) {
    if (!item.endsWith(".mp4")) continue;

    const fileInfo = await FileSystemLegacy.getInfoAsync(`${videosDirUri}/${item}`);
    if (!fileInfo.exists || fileInfo.isDirectory) continue;

    totalSize += fileInfo.size ?? 0;
    videoCount++;
  }

  return {
    used: totalSize,
    videoCount,
  };
}
