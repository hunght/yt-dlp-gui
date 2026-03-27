import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

export interface AppLogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  error?: string;
}

const isDev = __DEV__;
const MAX_LOG_ENTRIES = 800;
const LOG_STORAGE_KEY = "learnify-mobile-app-logs";
let logEntries: AppLogEntry[] = [];
let logCounter = 0;
let hydratePromise: Promise<void> | null = null;
let persistTimeout: ReturnType<typeof setTimeout> | null = null;

const appLogEntrySchema = z.object({
  id: z.number(),
  timestamp: z.string(),
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string(),
  context: z.string().optional(),
  error: z.string().optional(),
});

const appLogEntriesSchema = z.array(appLogEntrySchema);

const subscribers = new Set<(entries: AppLogEntry[]) => void>();

function formatMessage(level: LogLevel, message: string, context?: LogContext) {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toErrorString(error: Error | unknown): string {
  if (error instanceof Error) {
    if (error.stack && error.stack.trim().length > 0) {
      return error.stack;
    }
    return `${error.name}: ${error.message}`;
  }
  return safeStringify(error);
}

function appendLog(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: Error | unknown
) {
  const entry: AppLogEntry = {
    id: ++logCounter,
    timestamp: new Date().toISOString(),
    level,
    message,
    context: context ? safeStringify(context) : undefined,
    error: error != null ? toErrorString(error) : undefined,
  };

  logEntries = [...logEntries, entry];
  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries = logEntries.slice(logEntries.length - MAX_LOG_ENTRIES);
  }

  for (const subscriber of subscribers) {
    subscriber([...logEntries]);
  }

  schedulePersist();
}

function notifySubscribers() {
  for (const subscriber of subscribers) {
    subscriber([...logEntries]);
  }
}

async function hydrateEntries(): Promise<void> {
  if (hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(LOG_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsedRaw: unknown = JSON.parse(raw);
      const parsed = appLogEntriesSchema.safeParse(parsedRaw);
      if (!parsed.success) return;

      logEntries = parsed.data
        .filter((entry) => typeof entry?.id === "number" && typeof entry?.message === "string")
        .slice(-MAX_LOG_ENTRIES);
      logCounter = logEntries.reduce((maxId, entry) => Math.max(maxId, entry.id), 0);
      notifySubscribers();
    } catch (error) {
      if (isDev) {
        console.warn("[logger] Failed to hydrate persisted logs", error);
      }
    }
  })();

  return hydratePromise;
}

function schedulePersist() {
  if (persistTimeout) {
    clearTimeout(persistTimeout);
  }

  persistTimeout = setTimeout(() => {
    persistTimeout = null;
    void AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logEntries)).catch((error) => {
      if (isDev) {
        console.warn("[logger] Failed to persist logs", error);
      }
    });
  }, 250);
}

export const logger = {
  debug(message: string, context?: LogContext) {
    appendLog("debug", message, context);
    if (isDev) {
      console.debug(formatMessage("debug", message, context));
    }
  },

  info(message: string, context?: LogContext) {
    appendLog("info", message, context);
    if (isDev) {
      console.info(formatMessage("info", message, context));
    }
  },

  warn(message: string, context?: LogContext) {
    appendLog("warn", message, context);
    if (isDev) {
      console.warn(formatMessage("warn", message, context));
    }
  },

  error(message: string, error?: Error | unknown, context?: LogContext) {
    appendLog("error", message, context, error);
    if (isDev) {
      console.error(formatMessage("error", message, context), error);
    }
  },

  navigation(from: string | undefined, to: string, params?: Record<string, unknown>) {
    if (isDev) {
      console.info(formatMessage("info", `Navigation: ${from ?? "initial"} → ${to}`, params));
    }
  },

  setUser(_user: { id: string; email?: string; username?: string } | null) {},

  setTag(_key: string, _value: string) {},

  setContext(_name: string, _context: LogContext) {},

  getEntries(): AppLogEntry[] {
    return [...logEntries];
  },

  clearEntries() {
    logEntries = [];
    notifySubscribers();
    schedulePersist();
  },

  subscribe(listener: (entries: AppLogEntry[]) => void): () => void {
    subscribers.add(listener);
    listener([...logEntries]);
    return () => {
      subscribers.delete(listener);
    };
  },
};

void hydrateEntries();
