import {
  createDefaultFallbackState,
  getFallbackRetryDelayMs,
  getFormatString,
  getNextFallbackState,
  shouldAutoFallback,
  PLAYER_CLIENTS,
  FORMAT_STRATEGIES,
} from "./fallback-strategy";
import {
  DEFAULT_DOWNLOAD_PREFERENCES,
  normalizeVideoDownloadQuality,
} from "@/lib/types/user-preferences";

describe("download fallback strategy", () => {
  test("default fallback state covers all client/format combinations", () => {
    const state = createDefaultFallbackState();
    expect(state.maxFallbackAttempts).toBe(PLAYER_CLIENTS.length * FORMAT_STRATEGIES.length);
  });

  test("default extraction path is tried before restricted clients", () => {
    expect(PLAYER_CLIENTS[0]).toBe("default");
  });

  test("429 error retries same configuration with delay", () => {
    const initial = createDefaultFallbackState();
    const next = getNextFallbackState(
      initial,
      "HTTP Error 429: Too Many Requests",
      "http_429_rate_limited"
    );
    expect(next).not.toBeNull();
    expect(next?.playerClientIndex).toBe(initial.playerClientIndex);
    expect(next?.formatStrategyIndex).toBe(initial.formatStrategyIndex);
    expect(next?.fallbackAttempts).toBe(1);

    const delay = getFallbackRetryDelayMs(
      "HTTP Error 429: Too Many Requests",
      "http_429_rate_limited",
      next?.fallbackAttempts ?? 1
    );
    expect(delay).toBeGreaterThan(0);
  });

  test("ffmpeg errors move to next format strategy", () => {
    const initial = createDefaultFallbackState();
    const next = getNextFallbackState(
      initial,
      "ffmpeg is not installed, cannot merge formats",
      "ffmpeg_missing"
    );
    expect(next).not.toBeNull();
    expect(next?.playerClientIndex).toBe(initial.playerClientIndex);
    expect(next?.formatStrategyIndex).toBe(initial.formatStrategyIndex + 1);
  });

  test("quality shortfalls move to the next player client", () => {
    const initial = createDefaultFallbackState();
    const next = getNextFallbackState(
      initial,
      "Requested 1080p but downloaded 360p",
      "quality_too_low"
    );
    expect(next).not.toBeNull();
    expect(next?.playerClientIndex).toBe(initial.playerClientIndex + 1);
    expect(next?.formatStrategyIndex).toBe(0);
  });

  test("missing JavaScript runtime moves to the next player client", () => {
    const initial = createDefaultFallbackState();
    const next = getNextFallbackState(
      initial,
      "No supported JavaScript runtime available for yt-dlp YouTube extraction",
      "js_runtime_missing"
    );
    expect(next).not.toBeNull();
    expect(next?.playerClientIndex).toBe(initial.playerClientIndex + 1);
    expect(next?.formatStrategyIndex).toBe(0);
  });

  test("auth errors do not auto fallback", () => {
    expect(shouldAutoFallback("Sign in to confirm you're not a bot", "auth_required")).toBe(false);
  });

  test("spawn/binary availability errors do not auto fallback", () => {
    expect(shouldAutoFallback("yt-dlp binary is not available", "spawn_error")).toBe(false);
  });

  test("video download quality defaults to 1080p", () => {
    expect(DEFAULT_DOWNLOAD_PREFERENCES.downloadQuality).toBe("1080p");
  });

  test("sub-720p preferences are normalized to 720p", () => {
    expect(normalizeVideoDownloadQuality(undefined)).toBe("1080p");
    expect(normalizeVideoDownloadQuality("360p")).toBe("720p");
    expect(normalizeVideoDownloadQuality("480p")).toBe("720p");
    expect(normalizeVideoDownloadQuality("720p")).toBe("720p");
    expect(normalizeVideoDownloadQuality("1080p")).toBe("1080p");
  });

  test("format selection keeps a 720p floor for fallback strategies", () => {
    expect(getFormatString("quality", "360p")).toContain("height<=720");
    expect(getFormatString("quality", "480p")).toContain("height<=720");
    expect(getFormatString("fallback", "360p")).toContain("height<=720");
    expect(getFormatString("fallback", "480p")).toContain("height<=720");
  });
});
