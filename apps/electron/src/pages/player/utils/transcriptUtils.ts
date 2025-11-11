/**
 * Utility functions for transcript management
 * Pure functions with no React dependencies - easy to test and understand
 */

/**
 * Type guard to validate cooldown map structure from localStorage
 */
function isCooldownMap(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object") return false;

  // Check if all entries are string keys with number values
  return Object.entries(value).every(
    ([key, val]) => typeof key === "string" && typeof val === "number"
  );
}

/**
 * Safely parse cooldown map from localStorage
 */
function parseCooldownMap(raw: string | null): Record<string, number> {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    return isCooldownMap(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Filter available languages by user preferences
 */
export function filterLanguagesByPreference(
  availableLanguages: Array<{ lang: string; hasManual: boolean; hasAuto: boolean }>,
  preferredLanguages: string[]
): Array<{ lang: string; hasManual: boolean; hasAuto: boolean }> {
  if (preferredLanguages.length === 0) return availableLanguages;
  return availableLanguages.filter((l) => preferredLanguages.includes(l.lang));
}

/**
 * Check if a video/language combination is in cooldown
 */
export function isInCooldown(
  videoId: string,
  lang: string | null
): { inCooldown: boolean; minutesRemaining: number } {
  try {
    const key = `${videoId}|${lang ?? "__default__"}`;
    const raw = localStorage.getItem("transcript-download-cooldowns");
    const map = parseCooldownMap(raw);
    const until = map[key];

    if (until && Date.now() < until) {
      const minutesRemaining = Math.max(1, Math.ceil((until - Date.now()) / 60000));
      return { inCooldown: true, minutesRemaining };
    }
  } catch (e) {
    // Silently handle localStorage errors
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
    const map = parseCooldownMap(raw);
    map[key] = until;
    localStorage.setItem("transcript-download-cooldowns", JSON.stringify(map));
  } catch (e) {
    // Silently handle localStorage errors
  }
}

/**
 * Clear cooldown for a video/language combination
 */
export function clearCooldown(videoId: string, lang: string | null): void {
  try {
    const key = `${videoId}|${lang ?? "__default__"}`;
    const raw = localStorage.getItem("transcript-download-cooldowns");
    const map = parseCooldownMap(raw);
    if (map[key]) {
      delete map[key];
      localStorage.setItem("transcript-download-cooldowns", JSON.stringify(map));
    }
  } catch (e) {
    // Silently handle localStorage errors
  }
}

// Unused getEffectiveLanguage removed
