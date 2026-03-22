import { Bonjour, Service, Browser } from "bonjour-service";
import { app } from "electron";
import * as os from "os";
import { logger } from "../helpers/logger";
import { logMdnsDiagnosticSnapshot, updateMdnsRuntimeState } from "./mdnsDiagnostics";

/**
 * mDNS service for local network discovery.
 * Publishes the LearnifyTube service so mobile devices can discover it.
 * Also scans for mobile devices publishing the same service type.
 */

const SERVICE_TYPE = "learnify";
const SERVICE_NAME = (): string => `LearnifyTube-${os.hostname()}`;

type MdnsTransportEmitter = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

const getTransportEmitter = (instance: Bonjour): MdnsTransportEmitter | null => {
  const server: unknown = Reflect.get(instance, "server");
  if (!server || typeof server !== "object") {
    return null;
  }

  const mdns: unknown = Reflect.get(server, "mdns");
  if (!mdns || typeof mdns !== "object") {
    return null;
  }

  const onListener: unknown = Reflect.get(mdns, "on");
  if (typeof onListener !== "function") {
    return null;
  }

  return {
    on: (event, listener) => {
      Reflect.apply(onListener, mdns, [event, listener]);
    },
  };
};

export interface DiscoveredMobileDevice {
  name: string;
  host: string;
  port: number;
  videoCount: number;
  discoveredAt: number;
}

type MdnsService = {
  publish: (port: number, videoCount: number) => void;
  unpublish: () => void;
  updateVideoCount: (count: number) => void;
  isPublished: () => boolean;
  startScanning: () => void;
  stopScanning: () => void;
  getDiscoveredDevices: () => DiscoveredMobileDevice[];
};

const getTxtStringValue = (txt: unknown, key: string): string | undefined => {
  if (!txt || typeof txt !== "object") {
    return undefined;
  }

  const value: unknown = Reflect.get(txt, key);
  return typeof value === "string" ? value : undefined;
};

const createMdnsService = (): MdnsService => {
  let bonjour: Bonjour | null = null;
  let publishedService: Service | null = null;
  let browser: Browser | null = null;
  let currentPort = 0;
  let _currentVideoCount = 0;
  const discoveredDevices = new Map<string, DiscoveredMobileDevice>();
  const instrumentedBonjourInstances = new WeakSet<object>();

  logger.info("[mDNS] Creating mDNS service instance");
  updateMdnsRuntimeState({
    serviceName: SERVICE_NAME(),
    serviceType: `_${SERVICE_TYPE}._tcp.local.`,
  });

  const attachBonjourDiagnostics = (instance: Bonjour, source: "publish" | "scan"): void => {
    if (instrumentedBonjourInstances.has(instance)) {
      return;
    }
    instrumentedBonjourInstances.add(instance);

    const transport = getTransportEmitter(instance);
    if (!transport) {
      logger.warn("[mDNS] Low-level transport emitter unavailable for diagnostics", { source });
      return;
    }

    transport.on("ready", () => {
      logger.info("[mDNS] Low-level transport ready", { source });
    });

    transport.on("networkInterface", () => {
      logger.info("[mDNS] Multicast interfaces refreshed", { source });
      logMdnsDiagnosticSnapshot(
        "transport-network-interface-refresh",
        { source },
        { level: "info", throttleKey: `network-interface-${source}`, minIntervalMs: 10_000 }
      );
    });

    transport.on("warning", (error: unknown) => {
      logger.warn("[mDNS] Low-level transport warning", {
        source,
        error: error instanceof Error ? error.message : String(error),
      });
      logMdnsDiagnosticSnapshot(
        "transport-warning",
        {
          source,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? (error.stack ?? null) : null,
        },
        { level: "warn", throttleKey: `transport-warning-${source}` }
      );
    });

    transport.on("error", (error: unknown) => {
      logger.error("[mDNS] Low-level transport error", error);
      logMdnsDiagnosticSnapshot(
        "transport-error",
        {
          source,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? (error.stack ?? null) : null,
        },
        { level: "error", throttleKey: `transport-error-${source}` }
      );
    });
  };

  const publish = (port: number, videoCount: number): void => {
    logger.info(`[mDNS] Publishing service request: port=${port}, videoCount=${videoCount}`);

    // Unpublish any existing service first
    unpublish();

    try {
      logger.info("[mDNS] Creating Bonjour instance");
      bonjour = new Bonjour({}, (error: unknown) => {
        logger.error("[mDNS] Bonjour transport callback error", error);
        logMdnsDiagnosticSnapshot(
          "bonjour-transport-callback-error",
          {
            source: "publish",
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? (error.stack ?? null) : null,
          },
          { level: "error", throttleKey: "bonjour-transport-callback-error" }
        );
      });
      attachBonjourDiagnostics(bonjour, "publish");
      currentPort = port;
      _currentVideoCount = videoCount;

      const serviceName = SERVICE_NAME();
      logger.info(`[mDNS] Service name: ${serviceName}`);
      logger.info(`[mDNS] Service type: _${SERVICE_TYPE}._tcp`);

      publishedService = bonjour.publish({
        name: serviceName,
        type: SERVICE_TYPE,
        port,
        txt: {
          videoCount: String(videoCount),
          version: app.getVersion(),
          platform: "desktop",
        },
      });

      logger.info(
        `[mDNS] ✓ Published service: ${serviceName} on port ${port} with ${videoCount} videos`
      );
      logger.info(
        `[mDNS] Service details: _${SERVICE_TYPE}._tcp.local. TXT: videoCount=${videoCount}, platform=desktop`
      );
      updateMdnsRuntimeState({
        bonjourActive: true,
        serviceName,
        serviceType: `_${SERVICE_TYPE}._tcp.local.`,
        publishedPort: port,
        publishedVideoCount: videoCount,
        lastPublishAt: Date.now(),
      });
      logMdnsDiagnosticSnapshot(
        "publish-success",
        { source: "publish", port, videoCount },
        { level: "info", throttleKey: "publish-success", minIntervalMs: 5_000 }
      );
    } catch (error) {
      logger.error("[mDNS] ✗ Failed to publish service", error);
      logMdnsDiagnosticSnapshot(
        "publish-failed",
        {
          source: "publish",
          port,
          videoCount,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? (error.stack ?? null) : null,
        },
        { level: "error", throttleKey: "publish-failed" }
      );
    }
  };

  const unpublish = (): void => {
    logger.info("[mDNS] Unpublishing service...");

    if (publishedService) {
      try {
        publishedService.stop?.();
        logger.info("[mDNS] ✓ Service stopped");
      } catch (error) {
        logger.error("[mDNS] ✗ Failed to stop service", error);
      }
      publishedService = null;
    }

    if (bonjour) {
      try {
        bonjour.destroy();
        logger.info("[mDNS] ✓ Bonjour instance destroyed");
      } catch (error) {
        logger.error("[mDNS] ✗ Failed to destroy bonjour instance", error);
      }
      bonjour = null;
    }

    currentPort = 0;
    _currentVideoCount = 0;
    updateMdnsRuntimeState({
      bonjourActive: false,
      publishedPort: null,
      publishedVideoCount: null,
      browserRunning: false,
      discoveredDeviceCount: 0,
    });
    logger.info("[mDNS] Service unpublished");
  };

  const updateVideoCount = (count: number): void => {
    logger.info(`[mDNS] Updating video count to ${count}`);
    if (publishedService && currentPort > 0) {
      // Republish with updated video count
      publish(currentPort, count);
    } else {
      logger.warn("[mDNS] Cannot update video count - service not published");
    }
  };

  const isPublished = (): boolean => {
    const published = publishedService !== null;
    logger.debug(`[mDNS] isPublished: ${published}`);
    return published;
  };

  const startScanning = (): void => {
    if (browser) {
      logger.info("[mDNS] Scanner already running");
      return;
    }

    try {
      if (!bonjour) {
        bonjour = new Bonjour({}, (error: unknown) => {
          logger.error("[mDNS] Bonjour transport callback error", error);
          logMdnsDiagnosticSnapshot(
            "bonjour-transport-callback-error",
            {
              source: "scan",
              errorMessage: error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? (error.stack ?? null) : null,
            },
            { level: "error", throttleKey: "bonjour-transport-callback-error" }
          );
        });
      }
      attachBonjourDiagnostics(bonjour, "scan");

      logger.info(`[mDNS] Starting scan for _${SERVICE_TYPE}._tcp services`);

      browser = bonjour.find({ type: SERVICE_TYPE }, (service: Service) => {
        const platform = getTxtStringValue(service.txt, "platform");
        const videoCountRaw = getTxtStringValue(service.txt, "videoCount") ?? "0";
        const parsedVideoCount = Number.parseInt(videoCountRaw, 10);
        const videoCount = Number.isNaN(parsedVideoCount) ? 0 : parsedVideoCount;

        // Skip our own service
        if (service.name === SERVICE_NAME()) {
          logger.debug("[mDNS] Ignoring self");
          return;
        }

        // Only track mobile devices
        if (platform !== "mobile") {
          logger.debug(
            `[mDNS] Ignoring non-mobile device: ${service.name} (platform: ${platform})`
          );
          return;
        }

        // Find IPv4 address
        let host = service.host;
        if (service.addresses && service.addresses.length > 0) {
          const ipv4 = service.addresses.find(
            (addr: string) => addr.includes(".") && !addr.includes(":")
          );
          host = ipv4 || service.addresses[0];
        }

        const device: DiscoveredMobileDevice = {
          name: service.name,
          host,
          port: service.port,
          videoCount,
          discoveredAt: Date.now(),
        };

        logger.info("[mDNS] Mobile device discovered:", device);
        discoveredDevices.set(service.name, device);
        updateMdnsRuntimeState({ discoveredDeviceCount: discoveredDevices.size });
      });

      // Handle service removal
      browser.on("down", (service: Service) => {
        logger.info(`[mDNS] Device went offline: ${service.name}`);
        discoveredDevices.delete(service.name);
        updateMdnsRuntimeState({ discoveredDeviceCount: discoveredDevices.size });
      });

      logger.info("[mDNS] ✓ Scanner started");
      updateMdnsRuntimeState({
        bonjourActive: true,
        browserRunning: true,
        lastScanStartAt: Date.now(),
      });
      logMdnsDiagnosticSnapshot(
        "scan-started",
        { source: "scan" },
        { level: "info", throttleKey: "scan-started", minIntervalMs: 5_000 }
      );
    } catch (error) {
      logger.error("[mDNS] ✗ Failed to start scanner", error);
      logMdnsDiagnosticSnapshot(
        "scan-start-failed",
        {
          source: "scan",
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? (error.stack ?? null) : null,
        },
        { level: "error", throttleKey: "scan-start-failed" }
      );
    }
  };

  const stopScanning = (): void => {
    if (browser) {
      try {
        browser.stop();
        logger.info("[mDNS] ✓ Scanner stopped");
      } catch (error) {
        logger.error("[mDNS] ✗ Failed to stop scanner", error);
      }
      browser = null;
    }
    discoveredDevices.clear();
    updateMdnsRuntimeState({
      browserRunning: false,
      discoveredDeviceCount: 0,
    });
  };

  const getDiscoveredDevices = (): DiscoveredMobileDevice[] => {
    return Array.from(discoveredDevices.values());
  };

  return {
    publish,
    unpublish,
    updateVideoCount,
    isPublished,
    startScanning,
    stopScanning,
    getDiscoveredDevices,
  };
};

// Singleton instance
let mdnsServiceInstance: MdnsService | null = null;

export const getMdnsService = (): MdnsService => {
  if (!mdnsServiceInstance) {
    mdnsServiceInstance = createMdnsService();
  }
  return mdnsServiceInstance;
};
