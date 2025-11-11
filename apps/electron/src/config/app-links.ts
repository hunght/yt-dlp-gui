// Configuration file for application download links and version information

// Function to build download URLs based on a version
// eslint-disable-next-line import/no-unused-modules -- Used dynamically in update checker
export const buildAppLinks = (version: string) => ({
  // Main platform download links (for manual downloads)
  windows: `https://github.com/yt-dlp-gui/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui-${version}.Setup.exe`,
  macos: `https://github.com/yt-dlp-gui/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui-${version}-arm64.dmg`,
  linux: `https://github.com/yt-dlp-gui/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui_${version}_amd64.deb`,

  // Auto-update ZIP file links (for automatic updates)
  // Note: These patterns match Electron Forge's actual ZIP naming convention
  // Pattern: yt-dlp-gui-{platform}-{arch}-{version}.zip
  windowsZip: `https://github.com/yt-dlp-gui/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui-win32-x64-${version}.zip`,
  macosZip: `https://github.com/yt-dlp-gui/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui-darwin-arm64-${version}.zip`,
  macosIntelZip: `https://github.com/yt-dlp-gui/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui-darwin-x64-${version}.zip`,
  linuxZip: `https://github.com/yt-dlp-gui/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui-linux-x64-${version}.zip`,

  // Additional links
  releases: `https://github.com/yt-dlp-gui/yt-dlp-gui/releases`,

  // You can add other platform-specific links if needed
  macosIntel: `https://github.com/yt-dlp-gui/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui-${version}-x64.dmg`,
  linuxRpm: `https://github.com/yt-dlp-gui/yt-dlp-gui/releases/download/v${version}/yt-dlp-gui-${version}-1.x86_64.rpm`,
});
