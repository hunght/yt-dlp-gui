import fs from "node:fs";
import { logger } from "@/helpers/logger";
import { getBinDir, getVersionFilePath, getBinaryFilePath } from "./paths";
import { setExecutableIfNeeded, fileExists, readTextFile, writeTextFile } from "./filesystem";

const getYtDlpAssetName = (platform: NodeJS.Platform) => {
  switch (platform) {
    case "win32":
      return "yt-dlp.exe";
    case "darwin":
      return "yt-dlp_macos";
    case "linux":
      return "yt-dlp";
    default:
      return "yt-dlp";
  }
};

const getLatestReleaseApiUrl = () => "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";

const getDirectLatestDownloadUrl = (platform: NodeJS.Platform) => {
  const assetName = getYtDlpAssetName(platform);
  return `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`;
};

export const ensureBinDir = () => {
  const dir = getBinDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const fetchLatestRelease = async (): Promise<{
  version: string;
  assetUrl: string;
} | null> => {
  try {
    const releaseRes = await fetch(getLatestReleaseApiUrl());
    if (!releaseRes.ok) {
      logger.error("[binary] Failed to fetch latest release", { status: releaseRes.status });
      // Fallback to direct latest download URL without version
      return { version: "unknown", assetUrl: getDirectLatestDownloadUrl(process.platform) };
    }

    const json = (await releaseRes.json()) as {
      tag_name?: string;
      assets?: Array<{ name: string; browser_download_url: string }>;
    };

    const tag = (json.tag_name ?? "").replace(/^v/, "");
    const desiredAsset = getYtDlpAssetName(process.platform);
    const asset = json.assets?.find((a) => a.name === desiredAsset);
    const assetUrl = asset?.browser_download_url ?? getDirectLatestDownloadUrl(process.platform);

    return { version: tag || "unknown", assetUrl };
  } catch (e) {
    logger.error("[binary] Exception fetching latest release", e as Error);
    return { version: "unknown", assetUrl: getDirectLatestDownloadUrl(process.platform) };
  }
};

export const readInstalledVersion = (): string | null => {
  return readTextFile(getVersionFilePath());
};

export const writeInstalledVersion = (version: string) => {
  writeTextFile(getVersionFilePath(), version);
};

export const isBinaryInstalled = (): boolean => {
  return fileExists(getBinaryFilePath());
};

export const getInstallInfo = () => {
  const binPath = getBinaryFilePath();
  const installed = fileExists(binPath);
  const version = readInstalledVersion();
  return { installed, version, path: installed ? binPath : null };
};

export const finalizeBinaryInstall = (tmpPath: string, version: string): void => {
  const binPath = getBinaryFilePath();
  fs.copyFileSync(tmpPath, binPath);
  fs.unlinkSync(tmpPath);
  setExecutableIfNeeded(binPath);
  writeInstalledVersion(version);
  logger.info("[binary] Installed", { binPath, version });
};
