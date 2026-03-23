import { spawnSync } from "child_process";

import { logger } from "@/helpers/logger";

let cachedPreferredRuntime: string | null | undefined;

/**
 * Prefer Node for yt-dlp's JavaScript challenge solving when it is available on PATH.
 * Cache the result so queue operations don't keep probing the shell.
 */
export const getPreferredYtDlpJsRuntime = (): string | null => {
  if (cachedPreferredRuntime !== undefined) {
    return cachedPreferredRuntime;
  }

  const probe = spawnSync("node", ["--version"], {
    stdio: "ignore",
    env: process.env,
  });

  cachedPreferredRuntime = probe.status === 0 ? "node" : null;

  logger.info("[download-worker] Resolved yt-dlp JavaScript runtime", {
    preferredRuntime: cachedPreferredRuntime ?? "none",
  });

  return cachedPreferredRuntime;
};

export const resetPreferredYtDlpJsRuntimeCacheForTests = (): void => {
  cachedPreferredRuntime = undefined;
};
