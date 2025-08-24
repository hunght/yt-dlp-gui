// Configuration file for application download links and version information

// Function to build download URLs based on a version
export const buildAppLinks = (version: string) => ({
  // Main platform download links - update these when you publish releases
  windows: `https://github.com/your-org/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui-${version}.Setup.exe`,
  macos: `https://github.com/your-org/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui-${version}-arm64.dmg`,
  linux: `https://github.com/your-org/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui_${version}_amd64.deb`,

  // Additional links
  releases: `https://github.com/your-org/yt-dlp-gui/releases`,

  // You can add other platform-specific links if needed
  macosIntel: `https://github.com/your-org/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui-${version}-x64.dmg`,
  linuxRpm: `https://github.com/your-org/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui-${version}-1.x86_64.rpm`,
});
