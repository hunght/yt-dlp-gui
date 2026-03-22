import { execFileSync } from "child_process";
import * as os from "os";
import { logger } from "../helpers/logger";

type MdnsRuntimeState = {
  serviceName: string | null;
  serviceType: string | null;
  publishedPort: number | null;
  publishedVideoCount: number | null;
  bonjourActive: boolean;
  browserRunning: boolean;
  discoveredDeviceCount: number;
  lastPublishAt: number | null;
  lastScanStartAt: number | null;
};

type DiagnosticLevel = "info" | "warn" | "error";

const runtimeState: MdnsRuntimeState = {
  serviceName: null,
  serviceType: null,
  publishedPort: null,
  publishedVideoCount: null,
  bonjourActive: false,
  browserRunning: false,
  discoveredDeviceCount: 0,
  lastPublishAt: null,
  lastScanStartAt: null,
};

const diagnosticTimestamps = new Map<string, number>();
const DEFAULT_THROTTLE_MS = 30_000;

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

function toIsoOrNull(timestamp: number | null): string | null {
  return timestamp ? new Date(timestamp).toISOString() : null;
}

function summarizeInterfaces(): Array<{
  name: string;
  addresses: Array<{
    family: string;
    address: string;
    netmask: string;
    cidr: string | null;
    internal: boolean;
    mac: string;
  }>;
}> {
  return Object.entries(os.networkInterfaces())
    .map(([name, entries]) => ({
      name,
      addresses: (entries ?? []).map((entry) => ({
        family: String(entry.family),
        address: entry.address,
        netmask: entry.netmask,
        cidr: entry.cidr ?? null,
        internal: entry.internal,
        mac: entry.mac,
      })),
    }))
    .filter((iface) => iface.addresses.length > 0);
}

function safeExecFile(command: string, args: string[]): string | null {
  try {
    const output = execFileSync(command, args, {
      encoding: "utf8",
      timeout: 1500,
      maxBuffer: 128 * 1024,
    }).trim();

    return output.length > 0 ? output : null;
  } catch (error) {
    return `command failed: ${formatError(error)}`;
  }
}

function takeFirstLines(output: string | null, maxLines = 12): string[] | null {
  if (!output) {
    return null;
  }

  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(0, maxLines);
}

function getRelevantNetstatLines(): string[] | null {
  const output = safeExecFile("netstat", ["-rn", "-f", "inet"]);
  if (!output) {
    return null;
  }

  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(
      (line) =>
        line.includes("default") ||
        line.includes("224.0.0/4") ||
        line.includes("224.0.0.251") ||
        line.includes("239.255.255.250")
    );

  return lines.length > 0 ? lines : takeFirstLines(output, 12);
}

function shouldLogDiagnostics(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const previous = diagnosticTimestamps.get(key) ?? 0;

  if (now - previous < minIntervalMs) {
    return false;
  }

  diagnosticTimestamps.set(key, now);
  return true;
}

function buildDiagnosticSnapshot(
  reason: string,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    reason,
    host: {
      hostname: os.hostname(),
      platform: process.platform,
      release: os.release(),
      arch: process.arch,
    },
    runtime: {
      ...runtimeState,
      lastPublishAt: toIsoOrNull(runtimeState.lastPublishAt),
      lastScanStartAt: toIsoOrNull(runtimeState.lastScanStartAt),
    },
    interfaces: summarizeInterfaces(),
    routeToMdnsIpv4: takeFirstLines(safeExecFile("route", ["-n", "get", "224.0.0.251"]), 20),
    inetRoutes: getRelevantNetstatLines(),
    udp5353Listeners: takeFirstLines(safeExecFile("lsof", ["-nP", "-iUDP:5353"]), 20),
    extra: extra ?? null,
  };
}

export function updateMdnsRuntimeState(partial: Partial<MdnsRuntimeState>): void {
  Object.assign(runtimeState, partial);
}

export function isLikelyMdnsTransportError(error: unknown): boolean {
  const message = formatError(error);

  return (
    message.includes("224.0.0.251:5353") ||
    (message.includes("EHOSTUNREACH") && message.includes("5353")) ||
    message.includes("addMembership") ||
    message.includes("setMulticastInterface")
  );
}

export function logMdnsDiagnosticSnapshot(
  reason: string,
  extra?: Record<string, unknown>,
  options?: {
    level?: DiagnosticLevel;
    throttleKey?: string;
    minIntervalMs?: number;
  }
): void {
  const level = options?.level ?? "warn";
  const throttleKey = options?.throttleKey ?? reason;
  const minIntervalMs = options?.minIntervalMs ?? DEFAULT_THROTTLE_MS;

  if (!shouldLogDiagnostics(throttleKey, minIntervalMs)) {
    return;
  }

  const snapshot = buildDiagnosticSnapshot(reason, extra);
  if (level === "error") {
    logger.error("[mDNS][diag] Snapshot", snapshot);
    return;
  }

  if (level === "warn") {
    logger.warn("[mDNS][diag] Snapshot", snapshot);
    return;
  }

  logger.info("[mDNS][diag] Snapshot", snapshot);
}
