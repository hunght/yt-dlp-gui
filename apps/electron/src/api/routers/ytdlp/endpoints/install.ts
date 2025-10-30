import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { net } from "electron";
import { publicProcedure } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import {
  ensureBinDir,
  fetchLatestRelease,
  getInstallInfo,
  finalizeBinaryInstall,
} from "../utils/binary";
import { getBinaryFilePath } from "../utils/paths";
import { fileExists } from "../utils/filesystem";

export const installEndpoints = {
  getInstallInfo: publicProcedure.query(async () => {
    try {
      return getInstallInfo();
    } catch (e) {
      logger.error("[install] getInstallInfo failed", e as Error);
      return { installed: false, version: null, path: null } as const;
    }
  }),

  resolveLatest: publicProcedure.query(async () => {
    const info = await fetchLatestRelease();
    return info;
  }),

  downloadLatest: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .mutation(async ({ input }) => {
      ensureBinDir();
      const binPath = getBinaryFilePath();

      if (fileExists(binPath) && !input?.force) {
        const info = getInstallInfo();
        logger.info("[install] Binary already installed", { binPath, version: info.version });
        return {
          success: true as const,
          path: binPath,
          version: info.version ?? "unknown",
          alreadyInstalled: true as const,
        };
      }

      const latest = await fetchLatestRelease();
      if (!latest) {
        return { success: false as const, message: "Failed to resolve latest yt-dlp" } as const;
      }

      const tmpPath = path.join(os.tmpdir(), `yt-dlp-${Date.now()}`);
      logger.info("[install] Download starting", { url: latest.assetUrl });

      const result = await new Promise<{
        ok: boolean;
        error?: string;
      }>((resolve) => {
        let request: ReturnType<typeof net.request> | undefined;
        try {
          request = net.request({ method: "GET", url: latest.assetUrl });
        } catch (err) {
          logger.error("[install] net.request failed", err);
          return resolve({ ok: false, error: String(err) });
        }

        request.on("response", (response) => {
          const status = response.statusCode ?? 0;

          if (status >= 300 && status < 400) {
            const location = response.headers["location"];
            if (typeof location === "string") {
              logger.info("[install] Redirect", { to: location });
              resolve({ ok: false, error: "Redirect not followed automatically" });
              return;
            }
          }

          if (status >= 400) {
            resolve({ ok: false, error: `HTTP ${status}` });
            return;
          }

          const ws = fs.createWriteStream(tmpPath);
          response.on("data", (chunk) => ws.write(chunk));
          response.on("end", () => {
            ws.end();
            resolve({ ok: true });
          });
          response.on("error", (e) => {
            ws.close();
            resolve({ ok: false, error: String(e) });
          });
        });

        request.on("error", (e) => resolve({ ok: false, error: String(e) }));
        request.end();
      });

      if (!result.ok) {
        logger.error("[install] Download failed", { error: result.error });
        return { success: false as const, message: result.error ?? "Download failed" } as const;
      }

      try {
        finalizeBinaryInstall(tmpPath, latest.version);
        return {
          success: true as const,
          path: binPath,
          version: latest.version,
          alreadyInstalled: false as const,
        };
      } catch (e) {
        logger.error("[install] Failed to finalize installation", e as Error);
        return { success: false as const, message: `Install error: ${String(e)}` } as const;
      }
    }),
};
