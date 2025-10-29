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

type LogFunctions = {
	debug: (...args: any[]) => void;
	info: (...args: any[]) => void;
	warn: (...args: any[]) => void;
	error: (...args: any[]) => void;
};

interface UniversalLogger extends LogFunctions {
	fatal: (...args: any[]) => void;
	clearLogFile: () => Promise<void>;
	getFileContent: () => Promise<string>;
}

const isRenderer = typeof process !== "undefined" && (process as any).type === "renderer";
const isMain = typeof process !== "undefined" && (process as any).type === "browser";

// Lazily load electron-log for the current context to avoid bundling the wrong entry
const getMainLogger = () => {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const mod = require("electron-log/main");
	const log = mod.default ?? mod;

	// Ensure renderer bridge is initialized from main
	try {
		if (typeof log.initialize === "function") {
			log.initialize();
		}
	} catch (_) {
		// ignore
	}

	// Optionally, customize log file location or levels here
	// Example: keep default path at ~/Library/Logs/{app name}/main.log on macOS
	return log as LogFunctions & {
		transports: any;
	};
};

const getRendererLogger = (): LogFunctions => {
	// Prefer a direct renderer import to be able to configure transports (IPC in prod)
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const mod = require("electron-log/renderer");
		const rlog = (mod.default ?? mod) as LogFunctions & { transports?: any };
		// Ensure IPC transport is enabled in production so logs reach the main/file transport
		try {
			const isProd = process.env.NODE_ENV === "production";
			if (rlog?.transports?.ipc && isProd) {
				rlog.transports.ipc.level = "info"; // forward renderer logs in production
			}
		} catch (_) {
			// ignore transport tweaks if unavailable
		}
		return rlog;
	} catch (_) {
		// Fallback: rely on global injected by log.initialize() from main
		const gl = (globalThis as any).__electronLog as LogFunctions | undefined;
		if (gl) return gl;
		// Final fallback to console to avoid crashes
		return console as unknown as LogFunctions;
	}
};

const internal = isMain ? getMainLogger() : getRendererLogger();

// Adapter that preserves previous API surface
export const logger: UniversalLogger = {
	debug: (...args: any[]) => internal.debug?.(...args),
	info: (...args: any[]) => internal.info?.(...args),
	warn: (...args: any[]) => internal.warn?.(...args),
	error: (...args: any[]) => internal.error?.(...args),
	fatal: (...args: any[]) => internal.error?.("FATAL:", ...args),
	clearLogFile: async () => {
		if (!isMain) return; // no-op in renderer
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const mod = require("electron-log/main");
			const log = mod.default ?? mod;
			if (log?.transports?.file?.getFile) {
				const file = log.transports.file.getFile();
				if (file?.path) {
					await fs.promises.writeFile(file.path, "", { encoding: "utf-8" });
				}
			}
		} catch (err) {
			// As a last resort, try typical default path
			try {
				// electron-log default dir: {userData}/logs/main.log
				// userData is one level up from the logs dir.
				// We'll attempt to compute a reasonable fallback if available via app.getPath
				// Delay requiring electron only here to avoid renderer usage
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const { app } = require("electron");
				const userData = app?.getPath?.("userData");
				if (userData) {
					const p = path.join(userData, "logs", "main.log");
					await fs.promises.writeFile(p, "", { encoding: "utf-8" });
				}
			} catch (_) {
				// ignore
			}
		}
	},
	getFileContent: async () => {
		if (!isMain) return ""; // not available in renderer
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const mod = require("electron-log/main");
			const log = mod.default ?? mod;
			if (log?.transports?.file?.getFile) {
				const file = log.transports.file.getFile();
				if (file?.path && fs.existsSync(file.path)) {
					return await fs.promises.readFile(file.path, "utf8");
				}
			}
		} catch (_) {
			// Fallback to default path if needed
			try {
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const { app } = require("electron");
				const userData = app?.getPath?.("userData");
				if (userData) {
					const p = path.join(userData, "logs", "main.log");
					if (fs.existsSync(p)) {
						return await fs.promises.readFile(p, "utf8");
					}
				}
			} catch (_) {
				// ignore
			}
		}
		return "";
	},
};

