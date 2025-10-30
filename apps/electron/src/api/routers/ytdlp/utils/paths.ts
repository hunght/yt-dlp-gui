import path from "node:path";
import { app } from "electron";

export const getBinDir = () => path.join(app.getPath("userData"), "bin");

export const getVersionFilePath = () => path.join(getBinDir(), "yt-dlp-version.txt");

export const getBinaryFilePath = () => {
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

  return path.join(getBinDir(), getYtDlpAssetName(process.platform));
};

export const getThumbCacheDir = () => path.join(app.getPath("userData"), "cache", "thumbnails");

export const getDownloadsRoot = (outputDir?: string) => {
  return outputDir || path.join(app.getPath("downloads"), "yt-dlp-gui");
};
