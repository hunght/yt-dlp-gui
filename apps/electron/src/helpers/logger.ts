/*
	Universal logger powered by electron-log for both main and renderer.

	- In main process, uses 'electron-log/main' and initializes IPC bridge.
	- In renderer, prefers 'electron-log/renderer' (when available) or
		falls back to the global __electronLog exposed by main.initialize().

	Provides a stable API matching the prior ServerLogger usage:
		- debug/info/warn/error/fatal(...args)
		- clearLogFile(): Promise<void>  (no-op in renderer)
		- getFileContent(): Promise<string> (empty string in renderer)
*/

import * as fs from "fs";
import * as path from "path";

// Helper to normalize unknown errors to Error objects
function normalizeError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === "string") {
    return new Error(value);
  }
  if (typeof value === "object" && value !== null && "message" in value) {
    return new Error(String(value.message));
  }
  return new Error(String(value));
}

// Helper to normalize log arguments - converts unknown errors to Error objects
function normalizeLogArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    // If it looks like an error (has stack, message, or is Error instance), normalize it
    if (
      arg instanceof Error ||
      (typeof arg === "object" &&
        arg !== null &&
        ("stack" in arg || "message" in arg || "name" in arg))
    ) {
      return normalizeError(arg);
    }
    return arg;
  });
}

type LogFunctions = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

interface UniversalLogger extends LogFunctions {
  fatal: (...args: unknown[]) => void;
  clearLogFile: () => Promise<void>;
  getFileContent: () => Promise<string>;
}

// Check if we're in main process
const isMain =
  typeof process !== "undefined" &&
  "type" in process &&
  typeof process.type === "string" &&
  process.type === "browser";

// Lazily load electron-log for the current context to avoid bundling the wrong entry
const getMainLogger = async (): Promise<LogFunctions> => {
  try {
    const mod = await import("electron-log/main");
    const log = mod.default ?? mod;

    // Ensure renderer bridge is initialized from main
    if (typeof log.initialize === "function") {
      log.initialize();
    }

    return log;
  } catch {
    // Fallback to console if something went wrong
    return console;
  }
};

const getRendererLogger = async (): Promise<LogFunctions> => {
  // Prefer a direct renderer import to be able to configure transports (IPC in prod)
  try {
    const mod = await import("electron-log/renderer");
    const rlog = mod.default ?? mod;

    // Ensure IPC transport is enabled in production so logs reach the main/file transport
    const isProd = process.env.NODE_ENV === "production";
    if (rlog.transports?.ipc && isProd) {
      rlog.transports.ipc.level = "info";
    }

    return rlog;
  } catch {
    // Fallback: rely on global injected by log.initialize() from main
    if ("__electronLog" in globalThis) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const electronLog: unknown = (globalThis as Record<string, unknown>).__electronLog;
      // Check if it has the required log methods
      if (
        typeof electronLog === "object" &&
        electronLog !== null &&
        "debug" in electronLog &&
        "info" in electronLog &&
        "warn" in electronLog &&
        "error" in electronLog
      ) {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return electronLog as LogFunctions;
      }
    }

    // Final fallback to console to avoid crashes
    return console;
  }
};

// Initialize the logger asynchronously (skip in test environment to avoid Jest warnings)
const isTest = process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;
const internalPromise = !isTest
  ? isMain
    ? getMainLogger()
    : getRendererLogger()
  : Promise.resolve(console);
let internal: LogFunctions = console;

// Initialize immediately (but don't block) - skip in test environment
if (!isTest) {
  void internalPromise.then((log) => {
    internal = log;
  });
}

// Adapter that preserves previous API surface
export const logger: UniversalLogger = {
  debug: (...args: unknown[]) => internal.debug?.(...args),
  info: (...args: unknown[]) => internal.info?.(...args),
  warn: (...args: unknown[]) => internal.warn?.(...normalizeLogArgs(args)),
  error: (...args: unknown[]) => internal.error?.(...normalizeLogArgs(args)),
  fatal: (...args: unknown[]) => internal.error?.("FATAL:", ...normalizeLogArgs(args)),
  clearLogFile: async () => {
    if (!isMain) return; // no-op in renderer
    try {
      const mod = await import("electron-log/main");
      const log = mod.default ?? mod;

      const file = log.transports?.file?.getFile?.();
      if (file?.path) {
        await fs.promises.writeFile(file.path, "", { encoding: "utf-8" });
      }
    } catch {
      // As a last resort, try typical default path
      try {
        // electron-log default dir: {userData}/logs/main.log
        const { app } = await import("electron");
        const userData = app.getPath("userData");
        const p = path.join(userData, "logs", "main.log");
        await fs.promises.writeFile(p, "", { encoding: "utf-8" });
      } catch {
        // ignore
      }
    }
  },
  getFileContent: async () => {
    if (!isMain) return ""; // not available in renderer
    try {
      const mod = await import("electron-log/main");
      const log = mod.default ?? mod;

      const file = log.transports?.file?.getFile?.();
      if (file?.path && fs.existsSync(file.path)) {
        return await fs.promises.readFile(file.path, "utf8");
      }
    } catch {
      // Fallback to default path if needed
      try {
        const { app } = await import("electron");
        const userData = app.getPath("userData");
        const p = path.join(userData, "logs", "main.log");
        if (fs.existsSync(p)) {
          return await fs.promises.readFile(p, "utf8");
        }
      } catch {
        // ignore
      }
    }
    return "";
  },
};
