/**
 * User Preferences System for LearnifyTube
 * Allows users to customize their learning experience
 */

export type ThemeMode = "light" | "dark";

export type SidebarItem =
  | "home"
  | "dashboard"
  | "channels"
  | "playlists"
  | "my-playlists"
  | "subscriptions"
  | "history"
  | "my-words"
  | "flashcards"
  | "analytics"
  | "storage"
  | "mobile-sync"
  | "logs"
  | "settings";

export type UISize = "compact" | "comfortable" | "spacious";
export type FontScale = "small" | "normal" | "large" | "x-large";
export type AnimationSpeed = "none" | "reduced" | "normal" | "enhanced";
export type DownloadQuality = "360p" | "480p" | "720p" | "1080p";
export const YT_DLP_COOKIE_BROWSERS = [
  "none",
  "safari",
  "chrome",
  "firefox",
  "edge",
  "brave",
  "chromium",
  "opera",
  "vivaldi",
  "whale",
] as const;
export type YtDlpCookiesBrowser = (typeof YT_DLP_COOKIE_BROWSERS)[number];

export interface SidebarPreferences {
  visibleItems: SidebarItem[];
  collapsed: boolean;
}

export interface AppearancePreferences {
  themeMode: ThemeMode;
  fontScale: FontScale;
  fontFamily?: "default" | "sans" | "mono" | "dyslexic";
  uiSize: UISize;
  showAnimations: AnimationSpeed;
  reducedMotion: boolean;
  showIcons: boolean;
  roundedCorners: boolean;
}

export interface PlayerPreferences {
  autoPlay: boolean;
  defaultSpeed: number;
  defaultVolume: number;
  showSubtitles: boolean;
  subtitleLanguage: string;
}

export interface LearningPreferences {
  pauseOnNewWord: boolean;
  highlightTranslations: boolean;
  autoSaveWords: boolean;
}

export interface DownloadPreferences {
  downloadQuality: DownloadQuality;
  cookiesFromBrowser: YtDlpCookiesBrowser;
}

export interface SyncPreferences {
  enabled: boolean;
  port: number;
}

export interface UserPreferences {
  sidebar: SidebarPreferences;
  appearance: AppearancePreferences;
  player: PlayerPreferences;
  learning: LearningPreferences;
  download: DownloadPreferences;
  sync: SyncPreferences;
  version: number;
  lastUpdated: number;
}

// Defaults
export const DEFAULT_SIDEBAR_PREFERENCES: SidebarPreferences = {
  visibleItems: [
    "home",
    "dashboard",
    "channels",
    "playlists",
    "my-playlists",
    "subscriptions",
    "history",
    "my-words",
    "flashcards",
    "analytics",
    "storage",
    "mobile-sync",
    "logs",
    "settings",
  ],
  collapsed: false,
};

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  themeMode: "light",
  fontScale: "normal",
  fontFamily: "default",
  uiSize: "comfortable",
  showAnimations: "normal",
  reducedMotion: false,
  showIcons: true,
  roundedCorners: true,
};

export const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = {
  autoPlay: false,
  defaultSpeed: 1.0,
  defaultVolume: 70,
  showSubtitles: true,
  subtitleLanguage: "en",
};

export const DEFAULT_LEARNING_PREFERENCES: LearningPreferences = {
  pauseOnNewWord: false,
  highlightTranslations: true,
  autoSaveWords: true,
};

export const DEFAULT_DOWNLOAD_PREFERENCES: DownloadPreferences = {
  downloadQuality: "1080p", // Prefer Full HD by default; keep a 720p floor for smaller legacy presets
  cookiesFromBrowser: "none",
};

/**
 * Video downloads default to 1080p, but never go below 720p.
 * Users who want much smaller files should convert to audio instead.
 */
export const normalizeVideoDownloadQuality = (
  quality: DownloadQuality | null | undefined
): DownloadQuality => {
  if (quality === "1080p" || quality === null || quality === undefined) {
    return "1080p";
  }

  return "720p";
};

export const normalizeDownloadPreferences = (
  preferences: DownloadPreferences
): DownloadPreferences => ({
  ...preferences,
  downloadQuality: normalizeVideoDownloadQuality(preferences.downloadQuality),
});

export const DEFAULT_SYNC_PREFERENCES: SyncPreferences = {
  enabled: false,
  port: 53318,
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  sidebar: DEFAULT_SIDEBAR_PREFERENCES,
  appearance: DEFAULT_APPEARANCE_PREFERENCES,
  player: DEFAULT_PLAYER_PREFERENCES,
  learning: DEFAULT_LEARNING_PREFERENCES,
  download: normalizeDownloadPreferences(DEFAULT_DOWNLOAD_PREFERENCES),
  sync: DEFAULT_SYNC_PREFERENCES,
  version: 1,
  lastUpdated: Date.now(),
};
