import { spawn } from "node:child_process";
import { logger } from "@/helpers/logger";

/**
 * Helper to extract video ID from YouTube URL
 */
export function extractVideoId(url: string): string | undefined {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1];
}

/**
 * Wrapper around spawn() that logs all yt-dlp invocations for cost tracking.
 * Logs: command, arguments, operation type, and timing information.
 */
export function spawnYtDlpWithLogging(
  binPath: string,
  args: string[],
  options: { stdio?: any[] },
  context: {
    operation: string;
    url?: string;
    videoId?: string;
    channelId?: string;
    playlistId?: string;
    other?: Record<string, any>;
  }
): ReturnType<typeof spawn> {
  const startTime = Date.now();
  const fullCommand = `${binPath} ${args.join(" ")}`;

  logger.info("[yt-dlp] CALL_START", {
    operation: context.operation,
    command: fullCommand,
    args,
    url: context.url,
    videoId: context.videoId,
    channelId: context.channelId,
    playlistId: context.playlistId,
    ...context.other,
    timestamp: new Date().toISOString(),
  });

  const proc = spawn(binPath, args, options);

  // Track process lifecycle
  proc.on("spawn", () => {
    logger.debug("[yt-dlp] PROCESS_SPAWNED", {
      operation: context.operation,
      pid: proc.pid,
    });
  });

  let stdoutData = "";
  let stderrData = "";

  if (proc.stdout) {
    proc.stdout.on("data", (d) => {
      stdoutData += d.toString();
    });
  }

  if (proc.stderr) {
    proc.stderr.on("data", (d) => {
      stderrData += d.toString();
    });
  }

  proc.on("close", (code, signal) => {
    const durationMs = Date.now() - startTime;
    const success = code === 0;

    if (success) {
      logger.info("[yt-dlp] CALL_SUCCESS", {
        operation: context.operation,
        exitCode: code,
        signal,
        durationMs,
        stdoutLength: stdoutData.length,
        stderrLength: stderrData.length,
        url: context.url,
        videoId: context.videoId,
        channelId: context.channelId,
        playlistId: context.playlistId,
      });
    } else {
      logger.error("[yt-dlp] CALL_FAILED", {
        operation: context.operation,
        exitCode: code,
        signal,
        durationMs,
        error: stderrData || `Process exited with code ${code}`,
        stdoutLength: stdoutData.length,
        stderrLength: stderrData.length,
        url: context.url,
        videoId: context.videoId,
        channelId: context.channelId,
        playlistId: context.playlistId,
      });
    }
  });

  proc.on("error", (err) => {
    const durationMs = Date.now() - startTime;
    logger.error("[yt-dlp] CALL_ERROR", {
      operation: context.operation,
      error: String(err),
      durationMs,
      url: context.url,
      videoId: context.videoId,
      channelId: context.channelId,
      playlistId: context.playlistId,
    });
  });

  return proc;
}

export const runYtDlpJson = async (binPath: string, url: string): Promise<any> => {
  const metaJson = await new Promise<string>((resolve, reject) => {
    const proc = spawnYtDlpWithLogging(
      binPath,
      ["-J", url],
      { stdio: ["ignore", "pipe", "pipe"] },
      {
        operation: "fetch_metadata",
        url,
        videoId: extractVideoId(url),
      }
    );
    let out = "";
    let err = "";
    proc.stdout?.on("data", (d) => (out += d.toString()));
    proc.stderr?.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err || `yt-dlp -J exited with code ${code}`));
    });
  });
  return JSON.parse(metaJson);
};

export const runYtDlpFlatPlaylist = async (
  binPath: string,
  url: string,
  context?: {
    operation?: string;
    channelId?: string;
    playlistId?: string;
  }
): Promise<any> => {
  const json = await new Promise<string>((resolve, reject) => {
    const proc = spawnYtDlpWithLogging(
      binPath,
      ["-J", "--flat-playlist", url],
      { stdio: ["ignore", "pipe", "pipe"] },
      {
        operation: context?.operation ?? "fetch_playlist",
        url,
        channelId: context?.channelId,
        playlistId: context?.playlistId,
        other: { flatPlaylist: true },
      }
    );
    let out = "";
    let err = "";
    proc.stdout?.on("data", (d) => (out += d.toString()));
    proc.stderr?.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err || `yt-dlp exited with code ${code}`));
    });
  });
  return JSON.parse(json);
};

export const parseProgressLine = (line: string): number | null => {
  // Typical line: "[download]  12.3% of ..."
  const match = line.match(/(\d+(?:\.\d+)?)%/);
  if (match) {
    return Math.min(100, Math.max(0, Math.round(parseFloat(match[1]))));
  }
  return null;
};

export const extractMergedFilePath = (line: string): string | null => {
  const m = line.match(/Merging formats into \"(.+?)\"/);
  return m ? m[1] : null;
};
