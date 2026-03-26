import Constants from "expo-constants";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { Alert, Platform } from "react-native";
import { logger } from "./logger";

const DEFAULT_UPDATE_CHECK_TIMEOUT_MS = 10_000;
const UPDATE_APK_FILE_NAME = "learnifytube-update.apk";
const APK_MIME_TYPE = "application/vnd.android.package-archive";
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 268_435_456;
const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";
const INTENT_LAUNCHER_BUSY_RETRY_ATTEMPTS = 3;
const INTENT_LAUNCHER_BUSY_RETRY_DELAY_MS = 400;

interface ApkUpdateManifest {
  versionCode?: number;
  apkUrl: string;
  versionName?: string;
  releaseNotes?: string;
  forceUpdate?: boolean;
}

interface ApkUpdateConfig {
  manifestUrl?: string;
  githubRepo?: string;
  githubAssetName?: string;
  githubApiBaseUrl?: string;
  checkOnLaunch?: boolean;
  requestTimeoutMs?: number;
}

interface GithubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface GithubLatestReleaseResponse {
  tag_name?: string;
  name?: string;
  body?: string;
  assets?: GithubReleaseAsset[];
}

interface VersionComparisonResult {
  isNewer: boolean;
  summaryLines: string[];
}

export interface AndroidApkUpdateAvailability {
  configured: boolean;
  hasUpdate: boolean;
  latestVersionLabel?: string;
  summaryLines?: string[];
}

const getSafeErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unknown error";
};

const parsePositiveInt = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
};

const normalizeVersionName = (value: string): string => {
  // Strip prefixes like "mobile-v", "desktop-v", or plain "v" before the semver digits.
  return value.trim().replace(/^(?:[a-z][\w]*-)?v?/i, "");
};

const parseSemver = (version: string): [number, number, number] | null => {
  const normalized = normalizeVersionName(version).split("+")[0].split("-")[0];
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(normalized);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const compareSemver = (left: string, right: string): number | null => {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);

  if (!leftParts || !rightParts) {
    return null;
  }

  for (let i = 0; i < leftParts.length; i += 1) {
    if (leftParts[i] > rightParts[i]) {
      return 1;
    }
    if (leftParts[i] < rightParts[i]) {
      return -1;
    }
  }

  return 0;
};

const extractVersionCodeFromText = (text: string | undefined): number | null => {
  if (!text) {
    return null;
  }

  const match = /(?:^|\n)\s*versionCode\s*[:=]\s*(\d+)\b/i.exec(text);
  return parsePositiveInt(match?.[1]);
};

const extractVersionCodeFromAssetName = (
  assetName: string | undefined
): number | null => {
  if (!assetName) {
    return null;
  }

  const match = /(?:^|[-_])vc(\d+)(?:[-_.]|$)/i.exec(assetName);
  return parsePositiveInt(match?.[1]);
};

const getUpdateConfig = (): ApkUpdateConfig => {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    apkUpdate?: ApkUpdateConfig;
  };
  return extra.apkUpdate ?? {};
};

const getCurrentVersionCode = (): number | null => {
  return parsePositiveInt(Constants.nativeBuildVersion);
};

const getCurrentVersionName = (): string | null => {
  const nativeAppVersion = Constants.nativeAppVersion;
  if (typeof nativeAppVersion === "string" && nativeAppVersion.trim().length > 0) {
    return normalizeVersionName(nativeAppVersion);
  }

  const appVersion = Constants.expoConfig?.version;
  if (typeof appVersion === "string" && appVersion.trim().length > 0) {
    return normalizeVersionName(appVersion);
  }

  return null;
};

const promptForAction = (
  title: string,
  message: string,
  primaryButtonText: string,
  cancelButtonText = "Cancel"
): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    Alert.alert(
      title,
      message,
      [
        {
          text: cancelButtonText,
          style: "cancel",
          onPress: () => finish(false),
        },
        {
          text: primaryButtonText,
          onPress: () => finish(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => finish(false),
      }
    );
  });

const fetchWithTimeout = async (
  url: string,
  timeoutMs: number,
  options: RequestInit = {}
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const fetchUpdateManifestFromUrl = async (
  manifestUrl: string,
  timeoutMs: number
): Promise<ApkUpdateManifest> => {
  const response = await fetchWithTimeout(manifestUrl, timeoutMs);
  if (!response.ok) {
    throw new Error(`Update manifest request failed (HTTP ${response.status}).`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const versionCode = parsePositiveInt(payload.versionCode);
  const apkUrl =
    typeof payload.apkUrl === "string" && payload.apkUrl.trim().length > 0
      ? payload.apkUrl.trim()
      : null;

  if (!versionCode) {
    throw new Error("Update manifest is missing a valid versionCode.");
  }

  if (!apkUrl) {
    throw new Error("Update manifest is missing a valid apkUrl.");
  }

  return {
    versionCode,
    apkUrl,
    versionName:
      typeof payload.versionName === "string"
        ? normalizeVersionName(payload.versionName)
        : undefined,
    releaseNotes:
      typeof payload.releaseNotes === "string" ? payload.releaseNotes : undefined,
    forceUpdate: payload.forceUpdate === true,
  };
};

const selectGithubApkAsset = (
  assets: GithubReleaseAsset[],
  preferredAssetName: string | undefined
): GithubReleaseAsset | null => {
  if (preferredAssetName) {
    const exact = assets.find((asset) => asset.name === preferredAssetName);
    if (exact?.browser_download_url) {
      return exact;
    }
  }

  const apkAsset = assets.find(
    (asset) =>
      typeof asset.name === "string" &&
      asset.name.toLowerCase().endsWith(".apk") &&
      typeof asset.browser_download_url === "string" &&
      asset.browser_download_url.trim().length > 0
  );

  return apkAsset ?? null;
};

const fetchUpdateManifestFromGithubRelease = async (
  githubRepo: string,
  timeoutMs: number,
  options?: { assetName?: string; apiBaseUrl?: string }
): Promise<ApkUpdateManifest> => {
  if (!/^[^/\s]+\/[^/\s]+$/.test(githubRepo)) {
    throw new Error(
      `Invalid githubRepo '${githubRepo}'. Expected format: owner/repository.`
    );
  }

  const apiBaseUrl =
    options?.apiBaseUrl?.trim() || DEFAULT_GITHUB_API_BASE_URL;
  const endpoint = `${apiBaseUrl}/repos/${githubRepo}/releases/latest`;
  const response = await fetchWithTimeout(endpoint, timeoutMs, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub latest release request failed (HTTP ${response.status}).`
    );
  }

  const payload = (await response.json()) as GithubLatestReleaseResponse;
  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  const asset = selectGithubApkAsset(assets, options?.assetName);

  if (!asset?.browser_download_url) {
    if (options?.assetName) {
      throw new Error(
        `No APK asset named '${options.assetName}' found in latest GitHub release.`
      );
    }
    throw new Error("No APK asset found in latest GitHub release.");
  }

  const versionNameCandidate =
    typeof payload.tag_name === "string" && payload.tag_name.trim().length > 0
      ? payload.tag_name
      : typeof payload.name === "string"
        ? payload.name
        : undefined;

  const versionCode =
    extractVersionCodeFromText(payload.body) ??
    extractVersionCodeFromAssetName(asset.name) ??
    undefined;

  return {
    versionCode,
    versionName: versionNameCandidate
      ? normalizeVersionName(versionNameCandidate)
      : undefined,
    apkUrl: asset.browser_download_url.trim(),
    releaseNotes: typeof payload.body === "string" ? payload.body : undefined,
  };
};

const loadUpdateManifest = async (
  config: ApkUpdateConfig,
  timeoutMs: number
): Promise<ApkUpdateManifest> => {
  const manifestUrl = config.manifestUrl?.trim();
  if (manifestUrl) {
    return fetchUpdateManifestFromUrl(manifestUrl, timeoutMs);
  }

  const githubRepo = config.githubRepo?.trim();
  if (githubRepo) {
    return fetchUpdateManifestFromGithubRelease(githubRepo, timeoutMs, {
      assetName: config.githubAssetName?.trim(),
      apiBaseUrl: config.githubApiBaseUrl?.trim(),
    });
  }

  throw new Error("No update source configured.");
};

const compareRemoteVersion = (
  remote: ApkUpdateManifest,
  currentVersionCode: number | null,
  currentVersionName: string | null
): VersionComparisonResult | null => {
  if (remote.versionCode && currentVersionCode) {
    return {
      isNewer: remote.versionCode > currentVersionCode,
      summaryLines: [
        `Current build: ${currentVersionCode}`,
        `Latest build: ${remote.versionCode}`,
      ],
    };
  }

  if (remote.versionName && currentVersionName) {
    const semverResult = compareSemver(remote.versionName, currentVersionName);
    if (semverResult !== null) {
      return {
        isNewer: semverResult > 0,
        summaryLines: [
          `Current version: ${currentVersionName}`,
          `Latest version: ${remote.versionName}`,
        ],
      };
    }
  }

  return null;
};

const getUpdateFileUri = (): string => {
  const updatesDir = new Directory(Paths.cache, "updates");
  if (!updatesDir.exists) {
    updatesDir.create();
  }

  const updateFile = new File(updatesDir, UPDATE_APK_FILE_NAME);
  if (updateFile.exists) {
    updateFile.delete();
  }

  return updateFile.uri;
};

const downloadUpdateApk = async (apkUrl: string): Promise<string> => {
  const destinationUri = getUpdateFileUri();
  const downloadResumable = FileSystemLegacy.createDownloadResumable(
    apkUrl,
    destinationUri
  );
  const result = await downloadResumable.downloadAsync();

  if (!result || !result.uri || result.status < 200 || result.status >= 300) {
    throw new Error(
      `Failed to download APK update (HTTP ${result?.status ?? "unknown"}).`
    );
  }

  return result.uri;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isIntentLauncherBusyError = (error: unknown): boolean => {
  return getSafeErrorMessage(error).toLowerCase().includes(
    "activity is already started"
  );
};

const startIntentActivityWithRetry = async (
  activityAction: IntentLauncher.ActivityAction | string,
  params?: IntentLauncher.IntentLauncherParams
): Promise<void> => {
  for (let attempt = 1; attempt <= INTENT_LAUNCHER_BUSY_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await IntentLauncher.startActivityAsync(activityAction, params);
      return;
    } catch (error) {
      const shouldRetry =
        isIntentLauncherBusyError(error) &&
        attempt < INTENT_LAUNCHER_BUSY_RETRY_ATTEMPTS;

      if (!shouldRetry) {
        throw error;
      }

      await sleep(INTENT_LAUNCHER_BUSY_RETRY_DELAY_MS);
    }
  }
};

const openUnknownSourcesSettings = async (): Promise<void> => {
  const packageName = Constants.expoConfig?.android?.package;
  if (!packageName) {
    throw new Error("Android package name is unavailable.");
  }

  await startIntentActivityWithRetry(
    IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
    {
      data: `package:${packageName}`,
    }
  );
};

const launchPackageInstaller = async (apkUri: string): Promise<void> => {
  const contentUri = await FileSystemLegacy.getContentUriAsync(apkUri);
  await startIntentActivityWithRetry("android.intent.action.VIEW", {
    data: contentUri,
    type: APK_MIME_TYPE,
    flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
  });
};

const getUpdateTitle = (manifest: ApkUpdateManifest): string => {
  if (manifest.versionName && manifest.versionName.trim().length > 0) {
    return `Update ${manifest.versionName} available`;
  }
  if (manifest.versionCode) {
    return `Update build ${manifest.versionCode} available`;
  }
  return "Update available";
};

export const shouldCheckForUpdatesOnLaunch = (): boolean => {
  if (Platform.OS !== "android" || __DEV__) {
    return false;
  }

  const config = getUpdateConfig();
  return config.checkOnLaunch !== false;
};

export const getAndroidApkUpdateAvailability =
  async (): Promise<AndroidApkUpdateAvailability> => {
    if (Platform.OS !== "android") {
      return { configured: false, hasUpdate: false };
    }

    const config = getUpdateConfig();
    const hasManifestUrl = !!config.manifestUrl?.trim();
    const hasGithubRepo = !!config.githubRepo?.trim();

    if (!hasManifestUrl && !hasGithubRepo) {
      return { configured: false, hasUpdate: false };
    }

    const timeoutMs =
      parsePositiveInt(config.requestTimeoutMs) ?? DEFAULT_UPDATE_CHECK_TIMEOUT_MS;

    let manifest: ApkUpdateManifest;
    try {
      manifest = await loadUpdateManifest(config, timeoutMs);
    } catch (error) {
      logger.error("APK update availability check failed.", error, {
        manifestUrl: config.manifestUrl,
        githubRepo: config.githubRepo,
      });
      return { configured: true, hasUpdate: false };
    }

    const comparison = compareRemoteVersion(
      manifest,
      getCurrentVersionCode(),
      getCurrentVersionName()
    );

    if (!comparison) {
      return { configured: true, hasUpdate: false };
    }

    const latestVersionLabel =
      manifest.versionName ??
      (manifest.versionCode ? `build ${manifest.versionCode}` : undefined);

    return {
      configured: true,
      hasUpdate: comparison.isNewer,
      latestVersionLabel,
      summaryLines: comparison.summaryLines,
    };
  };

export const checkForAndroidApkUpdate = async (
  options?: { manual?: boolean }
): Promise<void> => {
  if (Platform.OS !== "android") {
    return;
  }

  const config = getUpdateConfig();
  const hasManifestUrl = !!config.manifestUrl?.trim();
  const hasGithubRepo = !!config.githubRepo?.trim();

  if (!hasManifestUrl && !hasGithubRepo) {
    if (options?.manual) {
      Alert.alert(
        "Updates not configured",
        "Set expo.extra.apkUpdate.manifestUrl or expo.extra.apkUpdate.githubRepo in app.json."
      );
    }
    logger.debug("APK update check skipped: no update source is configured.");
    return;
  }

  const currentVersionCode = getCurrentVersionCode();
  const currentVersionName = getCurrentVersionName();

  const timeoutMs =
    parsePositiveInt(config.requestTimeoutMs) ?? DEFAULT_UPDATE_CHECK_TIMEOUT_MS;

  let manifest: ApkUpdateManifest;
  try {
    manifest = await loadUpdateManifest(config, timeoutMs);
  } catch (error) {
    logger.error("APK update check failed.", error, {
      manifestUrl: config.manifestUrl,
      githubRepo: config.githubRepo,
    });
    if (options?.manual) {
      Alert.alert("Update check failed", getSafeErrorMessage(error));
    }
    return;
  }

  const comparison = compareRemoteVersion(
    manifest,
    currentVersionCode,
    currentVersionName
  );

  if (!comparison) {
    logger.warn("APK update check skipped: unable to compare local and remote versions.", {
      currentVersionCode,
      currentVersionName,
      remoteVersionCode: manifest.versionCode,
      remoteVersionName: manifest.versionName,
    });
    if (options?.manual) {
      Alert.alert(
        "Unable to compare versions",
        "Remote release is missing comparable version metadata."
      );
    }
    return;
  }

  if (!comparison.isNewer) {
    if (options?.manual) {
      Alert.alert("You are up to date", "This build is already the latest.");
    }
    return;
  }

  const updateMessageParts = [...comparison.summaryLines];

  if (manifest.releaseNotes) {
    updateMessageParts.push("", manifest.releaseNotes);
  }

  const shouldDownload = await promptForAction(
    getUpdateTitle(manifest),
    updateMessageParts.join("\n"),
    "Download"
  );

  if (!shouldDownload) {
    return;
  }

  try {
    Alert.alert(
      "Downloading update",
      "The APK is downloading now. Keep the app open until the installer appears."
    );
    const apkUri = await downloadUpdateApk(manifest.apkUrl);
    await launchPackageInstaller(apkUri);
    Alert.alert(
      "Installer opened",
      "Tap Install in the Android installer to complete the update."
    );
  } catch (error) {
    logger.error("APK update install flow failed.", error, {
      targetVersionCode: manifest.versionCode,
      apkUrl: manifest.apkUrl,
    });

    const openSettings = await promptForAction(
      "Update failed to start",
      "Enable 'Install unknown apps' for LearnifyTube, then retry update.",
      "Open Settings",
      "Close"
    );

    if (openSettings) {
      try {
        await openUnknownSourcesSettings();
      } catch (settingsError) {
        Alert.alert("Update failed", getSafeErrorMessage(settingsError));
      }
      return;
    }

    Alert.alert("Update failed", getSafeErrorMessage(error));
  }
};
