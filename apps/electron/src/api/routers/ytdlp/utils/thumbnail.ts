import fs from "node:fs";
import path from "node:path";
import { logger } from "@/helpers/logger";
import { getThumbCacheDir } from "./paths";
import { ensureDir } from "./filesystem";

export const downloadImageToCache = async (
  url: string,
  filenameBase: string
): Promise<string | null> => {
  try {
    await ensureDir(getThumbCacheDir());
    const extMatch = url.match(/\.(jpg|jpeg|png|webp)(?:\?|$)/i);
    const ext = (extMatch?.[1] || "jpg").toLowerCase();
    const filePath = path.join(getThumbCacheDir(), `${filenameBase}.${ext}`);

    const res = await fetch(url);
    if (!res.ok) {
      logger.warn("[thumbnail] download failed", { url, status: res.status });
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
    return filePath;
  } catch (err) {
    logger.warn("[thumbnail] download error", { url, error: String(err) });
    return null;
  }
};
