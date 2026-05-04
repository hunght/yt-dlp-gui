import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Constants from "expo-constants";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Logs } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useConnectionStore } from "../../stores/connection";
import { api } from "../../services/api";
import { getAndroidEmulatorHostConnectUrls } from "../../services/android-emulator";
import { logger, type AppLogEntry } from "../../services/logger";
import {
  checkForAndroidApkUpdate,
  getAndroidApkUpdateAvailability,
  type AndroidApkUpdateAvailability,
} from "../../services/app-update";
import { startScanning, stopScanning } from "../../services/p2p/discovery";
import {
  assertSyncCompatibility,
  SyncCompatibilityError,
} from "../../services/sync-compatibility";
import { ensureDiscoveryPermissions } from "../../services/discovery-permissions";
import { TVFocusPressable } from "../../components/tv/TVFocusPressable";
import type { DiscoveredPeer } from "../../types";

const DEFAULT_SYNC_PORT = 53318;
const LEGACY_SYNC_PORT = 8384;
const AUTO_CONNECT_DELAY_SECONDS = 3;
const AUTO_CONNECT_DELAY_MS = AUTO_CONNECT_DELAY_SECONDS * 1000;
const CONNECTION_ATTEMPT_TIMEOUT_MS = 4000;
const LOG_PAGE_SIZE = 16;

function getAndroidApiLevel(): number {
  if (Platform.OS !== "android") return 0;
  if (typeof Platform.Version === "number") return Platform.Version;
  const parsed = Number.parseInt(String(Platform.Version), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function buildManualConnectUrls(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  try {
    const parsed = new URL(withScheme);
    const protocol = parsed.protocol === "https:" ? "https:" : "http:";

    if (parsed.port) {
      return [`${protocol}//${parsed.hostname}:${parsed.port}`];
    }

    return Array.from(
      new Set([
        `${protocol}//${parsed.hostname}:${DEFAULT_SYNC_PORT}`,
        `${protocol}//${parsed.hostname}:${LEGACY_SYNC_PORT}`,
      ])
    );
  } catch {
    if (trimmed.includes(":")) return [`http://${trimmed}`];
    return [
      `http://${trimmed}:${DEFAULT_SYNC_PORT}`,
      `http://${trimmed}:${LEGACY_SYNC_PORT}`,
    ];
  }
}

function normalizeDiscoveredHost(host: string): string {
  const trimmed = host.trim().replace(/%.+$/, "");
  if (trimmed.includes(":") && !trimmed.startsWith("[")) {
    return `[${trimmed}]`;
  }
  return trimmed;
}

function hostPriority(host: string): number {
  const bare = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(bare)) return 0;
  if (bare.endsWith(".local")) return 1;
  if (bare.includes(":")) return 2;
  return 3;
}

function buildDiscoveredConnectUrls(device: DiscoveredPeer): string[] {
  const hosts = (
    device.hosts && device.hosts.length > 0 ? device.hosts : [device.host]
  )
    .map(normalizeDiscoveredHost)
    .filter((host) => host.length > 0)
    .sort((a, b) => hostPriority(a) - hostPriority(b));

  if (hosts.length === 0) return [];

  const ports = [device.port, DEFAULT_SYNC_PORT, LEGACY_SYNC_PORT].filter(
    (value, index, arr): value is number =>
      Number.isInteger(value) && value > 0 && arr.indexOf(value) === index
  );

  const urls: string[] = [];
  for (const host of hosts) {
    for (const port of ports) {
      urls.push(`http://${host}:${port}`);
    }
  }
  return Array.from(new Set(urls));
}

function getPeerKey(peer: DiscoveredPeer): string {
  return `${peer.name}|${peer.host}|${peer.port}`;
}

export default function TVSettingsScreen() {
  const serverUrl = useConnectionStore((state) => state.serverUrl);
  const serverName = useConnectionStore((state) => state.serverName);
  const setServerUrl = useConnectionStore((state) => state.setServerUrl);
  const setServerName = useConnectionStore((state) => state.setServerName);
  const disconnect = useConnectionStore((state) => state.disconnect);
  const isConnected = !!serverUrl;

  const [input, setInput] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredPeer[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [scanAttempt, setScanAttempt] = useState(0);
  const [autoConnectCountdown, setAutoConnectCountdown] = useState<number | null>(null);
  const [autoConnectBlockedPeerKey, setAutoConnectBlockedPeerKey] = useState<string | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isLoadingUpdateAvailability, setIsLoadingUpdateAvailability] =
    useState(false);
  const [updateAvailability, setUpdateAvailability] =
    useState<AndroidApkUpdateAvailability | null>(null);

  const autoConnectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoConnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const candidates = useMemo(() => buildManualConnectUrls(input), [input]);
  const singleDiscoveredDevice = discoveredDevices.length === 1 ? discoveredDevices[0] : null;
  const singleDiscoveredPeerKey = useMemo(
    () => (singleDiscoveredDevice ? getPeerKey(singleDiscoveredDevice) : null),
    [singleDiscoveredDevice]
  );
  const appVersion =
    Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "unknown";
  const appBuild = Constants.nativeBuildVersion ?? "-";
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);
  const [logEntries, setLogEntries] = useState<AppLogEntry[]>(() =>
    logger.getEntries()
  );
  const [logPage, setLogPage] = useState(0);
  const emulatorHostConnectUrls = useMemo(
    () => getAndroidEmulatorHostConnectUrls([DEFAULT_SYNC_PORT, LEGACY_SYNC_PORT]),
    []
  );
  const emulatorHostKey = useMemo(
    () =>
      emulatorHostConnectUrls.length > 0
        ? `emulator:${emulatorHostConnectUrls.join("|")}`
        : null,
    [emulatorHostConnectUrls]
  );
  const autoConnectCandidateUrls = useMemo(() => {
    if (singleDiscoveredDevice) {
      return buildDiscoveredConnectUrls(singleDiscoveredDevice);
    }
    if (discoveredDevices.length === 0) {
      return emulatorHostConnectUrls;
    }
    return [];
  }, [discoveredDevices.length, emulatorHostConnectUrls, singleDiscoveredDevice]);
  const autoConnectTargetKey = useMemo(
    () =>
      singleDiscoveredPeerKey ??
      (discoveredDevices.length === 0 ? emulatorHostKey : null),
    [discoveredDevices.length, emulatorHostKey, singleDiscoveredPeerKey]
  );
  const autoConnectTargetName = singleDiscoveredDevice?.name ?? "Desktop Host";

  const reversedLogs = useMemo(() => [...logEntries].reverse(), [logEntries]);
  const totalLogPages = Math.max(1, Math.ceil(reversedLogs.length / LOG_PAGE_SIZE));
  const clampedLogPage = Math.min(logPage, totalLogPages - 1);
  const pageStart = clampedLogPage * LOG_PAGE_SIZE;
  const pagedLogs = reversedLogs.slice(pageStart, pageStart + LOG_PAGE_SIZE);
  const hasOlderLogs = pageStart + LOG_PAGE_SIZE < reversedLogs.length;
  const hasNewerLogs = clampedLogPage > 0;

  const clearAutoConnectTimers = useCallback(() => {
    if (autoConnectIntervalRef.current) {
      clearInterval(autoConnectIntervalRef.current);
      autoConnectIntervalRef.current = null;
    }
    if (autoConnectTimeoutRef.current) {
      clearTimeout(autoConnectTimeoutRef.current);
      autoConnectTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = logger.subscribe((entries) => {
      setLogEntries(entries);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (logPage !== clampedLogPage) {
      setLogPage(clampedLogPage);
    }
  }, [clampedLogPage, logPage]);

  useEffect(() => {
    logger.info("[TV Settings] Opened settings", {
      platform: Platform.OS,
      androidApiLevel: getAndroidApiLevel(),
      appVersion,
      appBuild,
    });

    return () => {
      logger.info("[TV Settings] Closed settings");
    };
  }, [appBuild, appVersion]);

  const connectWithCandidates = useCallback(
    async (
      candidateUrls: string[],
      fallbackName: string,
      options?: { fromAuto?: boolean }
    ) => {
      if (candidateUrls.length === 0) {
        if (!options?.fromAuto) {
          setConnectionError("No valid connection endpoint found.");
        }
        logger.warn("[TV Discovery] No candidate URLs to connect", {
          fallbackName,
          fromAuto: options?.fromAuto ?? false,
        });
        return false;
      }

      setIsConnecting(true);
      setConnectionError(null);
      let lastError: unknown = null;
      logger.info("[TV Discovery] Connecting with candidate URLs", {
        fallbackName,
        fromAuto: options?.fromAuto ?? false,
        candidateUrls,
      });

      try {
        for (const baseUrl of candidateUrls) {
          logger.info("[TV Discovery] Trying endpoint", { baseUrl });
          try {
            const info = await api.getInfo(baseUrl, {
              timeoutMs: CONNECTION_ATTEMPT_TIMEOUT_MS,
            });
            assertSyncCompatibility(info);

            setServerUrl(baseUrl);
            setServerName(info.name ?? fallbackName);
            setConnectionError(null);
            logger.info("[TV Discovery] Connected to desktop", {
              baseUrl,
              serverName: info.name ?? fallbackName,
            });
            return true;
          } catch (error) {
            if (error instanceof SyncCompatibilityError) {
              setConnectionError(error.message);
              logger.warn("[TV Discovery] Sync compatibility failed", {
                baseUrl,
                message: error.message,
              });
              return false;
            }
            logger.warn("[TV Discovery] Endpoint failed", {
              baseUrl,
              error: getErrorMessage(error),
            });
            lastError = error;
          }
        }

        const reason = getErrorMessage(lastError ?? new Error("All connection attempts failed"));
        setConnectionError(reason);
        logger.error("[TV Discovery] All connection attempts failed", lastError, {
          reason,
          candidateUrls,
        });
        return false;
      } finally {
        setIsConnecting(false);
      }
    },
    [setServerName, setServerUrl]
  );

  const connectToDiscoveredDevice = useCallback(
    async (device: DiscoveredPeer, options?: { fromAuto?: boolean }) => {
      const candidateUrls = buildDiscoveredConnectUrls(device);
      logger.info("[TV Discovery] Connect to discovered device", {
        name: device.name,
        host: device.host,
        hosts: device.hosts,
        port: device.port,
        fromAuto: options?.fromAuto ?? false,
        candidateUrls,
      });
      return connectWithCandidates(candidateUrls, device.name, options);
    },
    [connectWithCandidates]
  );

  const connectToManualInput = useCallback(async () => {
    if (candidates.length === 0) {
      setConnectionError("Enter desktop host or IP first.");
      logger.warn("[TV Discovery] Manual connect attempted with empty input");
      return;
    }

    logger.info("[TV Discovery] Manual connect requested", {
      input,
      candidates,
    });
    await connectWithCandidates(candidates, "Desktop");
  }, [candidates, connectWithCandidates, input]);

  const triggerSmartReconnect = useCallback(() => {
    logger.info("[TV Discovery] Smart reconnect triggered");
    disconnect();
    setConnectionError(null);
    setInput("");
    setAutoConnectBlockedPeerKey(null);
    setScanAttempt((prev) => prev + 1);
  }, [disconnect]);

  const handleDisconnect = useCallback(() => {
    logger.info("[TV Discovery] Disconnect triggered");
    disconnect();
    setConnectionError(null);
    setAutoConnectBlockedPeerKey(null);
  }, [disconnect]);

  const handleRetryDiscovery = useCallback(() => {
    logger.info("[TV Discovery] Retry discovery triggered");
    setConnectionError(null);
    setScanAttempt((prev) => prev + 1);
  }, []);

  const refreshUpdateAvailability = useCallback(async () => {
    setIsLoadingUpdateAvailability(true);
    try {
      const availability = await getAndroidApkUpdateAvailability();
      setUpdateAvailability(availability);
    } finally {
      setIsLoadingUpdateAvailability(false);
    }
  }, []);

  useEffect(() => {
    void refreshUpdateAvailability();
  }, [refreshUpdateAvailability]);

  const handleUpdatePress = useCallback(async () => {
    if (isCheckingUpdate) return;

    setIsCheckingUpdate(true);
    try {
      await checkForAndroidApkUpdate({ manual: true });
    } finally {
      setIsCheckingUpdate(false);
      void refreshUpdateAvailability();
    }
  }, [isCheckingUpdate, refreshUpdateAvailability]);

  useEffect(() => {
    let cancelled = false;

    const beginScanning = async () => {
      logger.info("[TV Discovery] Begin scanning", { scanAttempt });
      setIsScanning(true);
      setConnectionError(null);
      setDiscoveredDevices([]);

      try {
        const permissionStatus = await ensureDiscoveryPermissions();
        if (cancelled) return;

        if (!permissionStatus.granted) {
          setConnectionError("Nearby devices permission is required for discovery.");
          setIsScanning(false);
          logger.warn("[TV Discovery] Scan blocked by missing permission", permissionStatus);
          return;
        }

        logger.info("[TV Discovery] Permissions granted, starting mDNS scan");
        startScanning({
          onPeerFound: (peer) => {
            if (cancelled) return;
            logger.info("[TV Discovery] Peer found", {
              name: peer.name,
              host: peer.host,
              hosts: peer.hosts,
              port: peer.port,
              videoCount: peer.videoCount,
            });
            setDiscoveredDevices((prev) => {
              const existing = prev.find((item) => item.name === peer.name);
              if (existing) {
                return prev.map((item) => (item.name === peer.name ? peer : item));
              }
              return [...prev, peer].sort((a, b) => a.name.localeCompare(b.name));
            });
            setIsScanning(false);
          },
          onPeerLost: (name) => {
            if (cancelled) return;
            logger.info("[TV Discovery] Peer lost", { name });
            setDiscoveredDevices((prev) => prev.filter((item) => item.name !== name));
          },
          onError: (error) => {
            if (cancelled) return;
            setConnectionError(`Discovery error: ${getErrorMessage(error)}`);
            setIsScanning(false);
            logger.error("[TV Discovery] Scan callback error", error);
          },
        });
      } catch (error) {
        if (!cancelled) {
          setConnectionError(`Discovery failed: ${getErrorMessage(error)}`);
          setIsScanning(false);
          logger.error("[TV Discovery] Failed to begin scan", error);
        }
      }
    };

    void beginScanning();

    return () => {
      cancelled = true;
      clearAutoConnectTimers();
      stopScanning();
      setIsScanning(false);
      logger.info("[TV Discovery] Stopped scanning (cleanup)", { scanAttempt });
    };
  }, [clearAutoConnectTimers, scanAttempt]);

  useEffect(() => {
    if (!autoConnectTargetKey) {
      setAutoConnectBlockedPeerKey(null);
      return;
    }

    if (
      autoConnectBlockedPeerKey &&
      autoConnectBlockedPeerKey !== autoConnectTargetKey
    ) {
      setAutoConnectBlockedPeerKey(null);
    }
  }, [autoConnectBlockedPeerKey, autoConnectTargetKey]);

  useEffect(() => {
    clearAutoConnectTimers();

    const isManualTyping = input.trim().length > 0;
    const canAutoConnect =
      !isConnected &&
      autoConnectCandidateUrls.length > 0 &&
      !isConnecting &&
      !isManualTyping &&
      autoConnectBlockedPeerKey !== autoConnectTargetKey;

    if (!canAutoConnect || !autoConnectTargetKey) {
      setAutoConnectCountdown(null);
      return;
    }

    let cancelled = false;
    logger.info("[TV Discovery] Auto-connect scheduled", {
      peer: autoConnectTargetName,
      peerKey: autoConnectTargetKey,
      source: singleDiscoveredDevice ? "discovered-peer" : "emulator-host",
      delaySeconds: AUTO_CONNECT_DELAY_SECONDS,
    });
    setAutoConnectCountdown(AUTO_CONNECT_DELAY_SECONDS);

    autoConnectIntervalRef.current = setInterval(() => {
      setAutoConnectCountdown((prev) => {
        if (prev === null) return null;
        return prev > 1 ? prev - 1 : 1;
      });
    }, 1000);

    autoConnectTimeoutRef.current = setTimeout(() => {
      void (async () => {
        if (cancelled) return;

        clearAutoConnectTimers();
        logger.info("[TV Discovery] Auto-connect attempting", {
          peer: autoConnectTargetName,
          peerKey: autoConnectTargetKey,
          source: singleDiscoveredDevice ? "discovered-peer" : "emulator-host",
        });
        const connected = await connectWithCandidates(
          autoConnectCandidateUrls,
          autoConnectTargetName,
          {
            fromAuto: true,
          }
        );

        if (!connected && !cancelled) {
          setAutoConnectBlockedPeerKey(autoConnectTargetKey);
          logger.warn("[TV Discovery] Auto-connect failed; peer blocked for this cycle", {
            peer: autoConnectTargetName,
            peerKey: autoConnectTargetKey,
            source: singleDiscoveredDevice ? "discovered-peer" : "emulator-host",
          });
        } else if (connected && !cancelled) {
          logger.info("[TV Discovery] Auto-connect succeeded", {
            peer: autoConnectTargetName,
            peerKey: autoConnectTargetKey,
            source: singleDiscoveredDevice ? "discovered-peer" : "emulator-host",
          });
        }

        if (!cancelled) {
          setAutoConnectCountdown(null);
        }
      })();
    }, AUTO_CONNECT_DELAY_MS);

    return () => {
      cancelled = true;
      clearAutoConnectTimers();
    };
  }, [
    autoConnectBlockedPeerKey,
    autoConnectCandidateUrls,
    autoConnectTargetKey,
    autoConnectTargetName,
    clearAutoConnectTimers,
    connectWithCandidates,
    input,
    isConnected,
    isConnecting,
    singleDiscoveredDevice,
  ]);

  const handleCancelAutoConnect = useCallback(() => {
    clearAutoConnectTimers();
    setAutoConnectCountdown(null);
    if (singleDiscoveredPeerKey) {
      setAutoConnectBlockedPeerKey(singleDiscoveredPeerKey);
    }
    logger.info("[TV Discovery] Auto-connect cancelled by user", {
      peerKey: singleDiscoveredPeerKey,
    });
  }, [clearAutoConnectTimers, singleDiscoveredPeerKey]);

  const openLogViewer = useCallback(() => {
    setLogPage(0);
    setIsLogViewerOpen(true);
    logger.info("[TV Settings] Opened log viewer");
  }, []);

  const closeLogViewer = useCallback(() => {
    setIsLogViewerOpen(false);
    logger.info("[TV Settings] Closed log viewer");
  }, []);

  const clearLogs = useCallback(() => {
    logger.clearEntries();
    logger.info("[TV Settings] Cleared app logs");
    setLogPage(0);
  }, []);

  const connectionLabel = isConnected
    ? `Connected to ${serverName ?? serverUrl}`
    : "Not connected to desktop";

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.topActions}>
          <TVFocusPressable style={styles.logButton} onPress={openLogViewer}>
            <Logs size={20} color="#fffef2" />
          </TVFocusPressable>
          <TVFocusPressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </TVFocusPressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        <View style={styles.settingsGrid}>
          <View style={[styles.section, styles.connectionSection]}>
            <Text style={styles.sectionTitle}>Desktop Connection</Text>
        <Text style={styles.statusText}>{connectionLabel}</Text>

        {!isConnected ? (
          <View style={styles.discoveryHint}>
            {isScanning ? <ActivityIndicator size="small" color="#ffd93d" /> : null}
            <Text style={styles.discoveryHintText}>
              {discoveredDevices.length > 0
                ? `${discoveredDevices.length} desktop${discoveredDevices.length > 1 ? "s" : ""} found nearby`
                : emulatorHostConnectUrls.length > 0
                  ? "Searching nearby desktop app... Trying emulator host too."
                  : "Searching nearby desktop app..."}
            </Text>
          </View>
        ) : null}

        {connectionError ? <Text style={styles.errorText}>{connectionError}</Text> : null}

        {singleDiscoveredDevice && autoConnectCountdown !== null && !isConnected ? (
          <View style={styles.autoConnectBanner}>
            <Text style={styles.autoConnectText}>
              Auto-connecting in {autoConnectCountdown}s
            </Text>
            <TVFocusPressable style={styles.cancelButton} onPress={handleCancelAutoConnect}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TVFocusPressable>
          </View>
        ) : null}

        {discoveredDevices.length > 0 ? (
          <View style={styles.deviceList}>
            {discoveredDevices.map((device, index) => (
              <TVFocusPressable
                key={getPeerKey(device)}
                style={styles.deviceButton}
                hasTVPreferredFocus={index === 0}
                onPress={() => {
                  handleCancelAutoConnect();
                  void connectToDiscoveredDevice(device);
                }}
                disabled={isConnecting}
              >
                <Text style={styles.deviceName}>{device.name}</Text>
                <Text style={styles.deviceHost}>{device.host}:{device.port}</Text>
              </TVFocusPressable>
            ))}
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          {isConnected ? (
            <>
              <TVFocusPressable style={styles.primaryAction} onPress={triggerSmartReconnect}>
                <Text style={styles.actionText}>Smart Reconnect</Text>
              </TVFocusPressable>
              <TVFocusPressable style={styles.secondaryAction} onPress={handleDisconnect}>
                <Text style={styles.actionText}>Disconnect</Text>
              </TVFocusPressable>
            </>
          ) : (
            <TVFocusPressable style={styles.primaryAction} onPress={handleRetryDiscovery}>
              <Text style={styles.actionText}>Retry Discovery</Text>
            </TVFocusPressable>
          )}
          </View>
        </View>

          <View style={styles.sideColumn}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Manual Fallback</Text>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={emulatorHostConnectUrls.length > 0 ? "10.0.2.2" : "192.168.1.5"}
          placeholderTextColor="#64748b"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TVFocusPressable
          style={styles.primaryAction}
          onPress={() => void connectToManualInput()}
          disabled={isConnecting}
        >
          <Text style={styles.actionText}>
            {isConnecting ? "Connecting..." : "Connect Now"}
          </Text>
        </TVFocusPressable>

        {candidates.length > 0 ? (
          <Text style={styles.candidatesText}>{candidates[0]}</Text>
        ) : emulatorHostConnectUrls.length > 0 ? (
          <Text style={styles.candidatesText}>Emulator tip: try 10.0.2.2</Text>
        ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>App</Text>
        <Text style={styles.statusText}>
          Version {appVersion} (build {appBuild})
        </Text>

        {isLoadingUpdateAvailability ? (
          <View style={styles.discoveryHint}>
            <ActivityIndicator size="small" color="#ffd93d" />
            <Text style={styles.discoveryHintText}>Checking update status...</Text>
          </View>
        ) : null}

        <TVFocusPressable
          style={[styles.primaryAction, isCheckingUpdate && styles.actionDisabled]}
          onPress={() => void handleUpdatePress()}
          disabled={isCheckingUpdate}
        >
          <Text style={styles.actionText}>
            {isCheckingUpdate
              ? "Opening installer..."
              : updateAvailability?.hasUpdate
                ? "Download Update"
                : "Check for Updates"}
          </Text>
        </TVFocusPressable>

        {updateAvailability?.hasUpdate ? (
          <Text style={styles.discoveryHintText}>
            {updateAvailability.latestVersionLabel
              ? `New version ${updateAvailability.latestVersionLabel} is available`
              : "A new app version is available"}
          </Text>
        ) : null}

        {!isLoadingUpdateAvailability &&
        updateAvailability?.configured &&
        !updateAvailability.hasUpdate ? (
          <Text style={styles.candidatesText}>App is up to date</Text>
        ) : null}
            </View>
          </View>
        </View>
      </ScrollView>

      {isLogViewerOpen ? (
        <View style={styles.logOverlay}>
          <View style={styles.logPanel}>
            <View style={styles.logHeader}>
              <Text style={styles.logTitle}>App Logs</Text>
              <Text style={styles.logMeta}>
                Page {clampedLogPage + 1}/{totalLogPages} · {logEntries.length} entries
              </Text>
            </View>

            <View style={styles.logActions}>
              <TVFocusPressable
                style={[styles.logActionButton, !hasOlderLogs && styles.logActionDisabled]}
                disabled={!hasOlderLogs}
                onPress={() => setLogPage((prev) => prev + 1)}
              >
                <Text style={styles.logActionText}>Older</Text>
              </TVFocusPressable>

              <TVFocusPressable
                style={[styles.logActionButton, !hasNewerLogs && styles.logActionDisabled]}
                disabled={!hasNewerLogs}
                onPress={() => setLogPage((prev) => Math.max(0, prev - 1))}
              >
                <Text style={styles.logActionText}>Newer</Text>
              </TVFocusPressable>

              <TVFocusPressable style={styles.logActionButton} onPress={clearLogs}>
                <Text style={styles.logActionText}>Clear</Text>
              </TVFocusPressable>

              <TVFocusPressable
                style={styles.logActionButton}
                onPress={closeLogViewer}
                hasTVPreferredFocus
              >
                <Text style={styles.logActionText}>Close</Text>
              </TVFocusPressable>
            </View>

            <View style={styles.logBody}>
              {pagedLogs.length === 0 ? (
                <Text style={styles.logEmptyText}>No logs yet</Text>
              ) : (
                pagedLogs.map((entry) => (
                  <Text
                    key={entry.id}
                    style={[
                      styles.logLine,
                      entry.level === "warn" && styles.logLineWarn,
                      entry.level === "error" && styles.logLineError,
                    ]}
                    numberOfLines={2}
                  >
                    [{entry.timestamp}] [{entry.level.toUpperCase()}] {entry.message}
                    {entry.context ? ` ${entry.context}` : ""}
                    {entry.error ? ` | ${entry.error}` : ""}
                  </Text>
                ))
              )}
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#132447",
    paddingHorizontal: 24,
    paddingBottom: 10,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  settingsGrid: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  connectionSection: {
    flex: 1.25,
  },
  sideColumn: {
    flex: 0.85,
    gap: 10,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: "#fff4cc",
    fontSize: 34,
    fontWeight: "900",
  },
  logButton: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#8ec5ff",
    backgroundColor: "#2d7ff9",
    paddingHorizontal: 11,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ffd93d",
    backgroundColor: "#ff8a00",
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  backText: {
    color: "#fffef2",
    fontSize: 17,
    fontWeight: "900",
  },
  section: {
    marginTop: 0,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#2f5f9f",
    backgroundColor: "#1b376f",
    padding: 12,
    gap: 7,
    shadowColor: "#020817",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  sectionTitle: {
    color: "#fffef2",
    fontSize: 20,
    fontWeight: "900",
  },
  statusText: {
    color: "#eaf5ff",
    fontSize: 16,
    fontWeight: "700",
  },
  discoveryHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  discoveryHintText: {
    color: "#eaf5ff",
    fontSize: 14,
    fontWeight: "700",
  },
  errorText: {
    color: "#ffe3e3",
    fontSize: 13,
    fontWeight: "700",
  },
  autoConnectBanner: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ffd93d",
    backgroundColor: "#ff8a00",
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  autoConnectText: {
    color: "#fffef2",
    fontSize: 15,
    fontWeight: "900",
    flex: 1,
  },
  cancelButton: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ffe48f",
    backgroundColor: "#ff6b6b",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cancelButtonText: {
    color: "#fffef2",
    fontSize: 14,
    fontWeight: "900",
  },
  deviceList: {
    gap: 6,
  },
  deviceButton: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ffd93d",
    backgroundColor: "#40c4aa",
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 2,
  },
  deviceName: {
    color: "#fffef2",
    fontSize: 16,
    fontWeight: "900",
  },
  deviceHost: {
    color: "#e8fffa",
    fontSize: 13,
    fontWeight: "700",
  },
  actionsRow: {
    marginTop: 2,
    flexDirection: "row",
    gap: 8,
  },
  primaryAction: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ffd93d",
    backgroundColor: "#ff6b6b",
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  secondaryAction: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ffd93d",
    backgroundColor: "#ff8a00",
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  actionText: {
    color: "#fffef2",
    fontSize: 16,
    fontWeight: "900",
  },
  actionDisabled: {
    opacity: 0.6,
  },
  input: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#8ec5ff",
    backgroundColor: "#132447",
    color: "#fffef2",
    fontSize: 17,
    fontWeight: "800",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  candidatesText: {
    color: "#dbeafe",
    fontSize: 13,
    fontWeight: "700",
  },
  logOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    paddingHorizontal: 28,
    paddingVertical: 22,
    justifyContent: "center",
  },
  logPanel: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#8ec5ff",
    backgroundColor: "#0f1b3a",
    padding: 16,
    gap: 12,
  },
  logHeader: {
    gap: 4,
  },
  logTitle: {
    color: "#fff4cc",
    fontSize: 28,
    fontWeight: "900",
  },
  logMeta: {
    color: "#bfdbfe",
    fontSize: 15,
    fontWeight: "700",
  },
  logActions: {
    flexDirection: "row",
    gap: 10,
  },
  logActionButton: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ffd93d",
    backgroundColor: "#ff8a00",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logActionDisabled: {
    opacity: 0.45,
  },
  logActionText: {
    color: "#fffef2",
    fontSize: 16,
    fontWeight: "800",
  },
  logBody: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#020817",
    minHeight: 420,
    maxHeight: 420,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  logEmptyText: {
    color: "#94a3b8",
    fontSize: 15,
    fontWeight: "700",
  },
  logLine: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "500",
  },
  logLineWarn: {
    color: "#fde68a",
  },
  logLineError: {
    color: "#fca5a5",
  },
});
