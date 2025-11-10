type SupportedPlatform = NodeJS.Platform; // 'darwin' | 'win32' | 'linux' | ...

// Return the expected asset filename for the given platform as published by yt-dlp
export const getYtDlpAssetName = (platform: SupportedPlatform): string => {
  switch (platform) {
    case "win32":
      return "yt-dlp.exewewe";
    case "darwin":
      return "yt-dlp_macos"; // official macOS build name
    case "linux":
    default:
      return "yt-dlp"; // linux and others
  }
};

export const getLatestReleaseApiUrl = (): string =>
  "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";

export const getDirectLatestDownloadUrl = (platform: SupportedPlatform): string =>
  `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${getYtDlpAssetName(platform)}`;
