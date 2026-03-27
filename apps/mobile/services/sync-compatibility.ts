import type { ServerInfo } from "../types";
import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  MIN_SUPPORTED_DESKTOP_SYNC_PROTOCOL_VERSION,
} from "../../shared/mobile-sync-contract";

const LEGACY_SYNC_PROTOCOL_VERSION = 1;
const LEGACY_MIN_SUPPORTED_MOBILE_SYNC_PROTOCOL_VERSION = 1;

type SyncCompatibilityIssue = "desktop_update_required" | "mobile_update_required";

const getSafeInteger = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
};

export class SyncCompatibilityError extends Error {
  readonly issue: SyncCompatibilityIssue;

  constructor(issue: SyncCompatibilityIssue, message: string) {
    super(message);
    this.name = "SyncCompatibilityError";
    this.issue = issue;
  }
}

export const assertSyncCompatibility = (info: ServerInfo): void => {
  const desktopProtocolVersion =
    getSafeInteger(info.syncProtocolVersion) ?? LEGACY_SYNC_PROTOCOL_VERSION;
  const desktopMinMobileProtocolVersion =
    getSafeInteger(info.minSupportedMobileSyncProtocolVersion) ??
    LEGACY_MIN_SUPPORTED_MOBILE_SYNC_PROTOCOL_VERSION;

  if (desktopProtocolVersion < MIN_SUPPORTED_DESKTOP_SYNC_PROTOCOL_VERSION) {
    throw new SyncCompatibilityError(
      "desktop_update_required",
      `Desktop app ${info.version} is too old for this mobile app. Please update LearnifyTube Desktop and reconnect.`
    );
  }

  if (MOBILE_SYNC_PROTOCOL_VERSION < desktopMinMobileProtocolVersion) {
    throw new SyncCompatibilityError(
      "mobile_update_required",
      "This desktop app requires a newer LearnifyTube mobile build. Please update your Android app and reconnect."
    );
  }
};

