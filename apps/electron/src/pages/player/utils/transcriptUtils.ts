/**
 * Utility functions for transcript management
 * Pure functions with no React dependencies - easy to test and understand
 */

/**
 * Filter available languages by user preferences
 */
export function filterLanguagesByPreference(
  availableLanguages: Array<{ lang: string; hasManual: boolean; hasAuto: boolean }>,
  preferredLanguages: string[]
): Array<{ lang: string; hasManual: boolean; hasAuto: boolean }> {
  if (preferredLanguages.length === 0) return availableLanguages;
  return availableLanguages.filter(l => preferredLanguages.includes(l.lang));
}

/**
 * Check if a video/language combination is in cooldown
 */
export function isInCooldown(videoId: string, lang: string | null): { inCooldown: boolean; minutesRemaining: number } {
  try {
    const key = `${videoId}|${lang ?? "__default__"}`;
    const raw = localStorage.getItem("transcript-download-cooldowns");
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const until = map[key];

    if (until && Date.now() < until) {
      const minutesRemaining = Math.max(1, Math.ceil((until - Date.now()) / 60000));
      return { inCooldown: true, minutesRemaining };
    }
  } catch (e) {
    console.error('Error checking cooldown:', e);
  }

  return { inCooldown: false, minutesRemaining: 0 };
}

/**
 * Set cooldown for a video/language combination
 */
export function setCooldown(videoId: string, lang: string | null, retryAfterMs: number): void {
  try {
    const key = `${videoId}|${lang ?? "__default__"}`;
    const until = Date.now() + retryAfterMs;
    const raw = localStorage.getItem("transcript-download-cooldowns");
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[key] = until;
    localStorage.setItem("transcript-download-cooldowns", JSON.stringify(map));
  } catch (e) {
    console.error('Error setting cooldown:', e);
  }
}

/**
 * Clear cooldown for a video/language combination
 */
export function clearCooldown(videoId: string, lang: string | null): void {
  try {
    const key = `${videoId}|${lang ?? "__default__"}`;
    const raw = localStorage.getItem("transcript-download-cooldowns");
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    if (map[key]) {
      delete map[key];
      localStorage.setItem("transcript-download-cooldowns", JSON.stringify(map));
    }
  } catch (e) {
    console.error('Error clearing cooldown:', e);
  }
}

// Unused getEffectiveLanguage removed

