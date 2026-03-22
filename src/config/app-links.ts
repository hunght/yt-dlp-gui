// Configuration file for application download links and version information

export type AppLinks = {
  windows: string;
  macos: string;
  linux: string;
  releases: string;
  macosIntel: string;
  linuxRpm: string;
};

// Function to build download URLs based on a version
export const buildAppLinks = (version: string): AppLinks => ({
  // Main platform download links (for manual downloads)
  windows: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube-${version}.Setup.exe`,
  macos: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube-${version}-arm64.dmg`,
  linux: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube_${version}_amd64.deb`,

  // Additional links
  releases: `https://github.com/hunght/LearnifyTube/releases`,

  // You can add other platform-specific links if needed
  macosIntel: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube-${version}-x64.dmg`,
  linuxRpm: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube-${version}-1.x86_64.rpm`,
});
