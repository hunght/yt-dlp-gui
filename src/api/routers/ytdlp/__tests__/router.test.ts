import path from "path";
import fs from "fs";

// Mocks
jest.mock("@/helpers/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    getFileContent: jest.fn(),
    clearLogFile: jest.fn(),
  },
}));

jest.mock("electron", () => {
  return {
    app: {
      getPath: jest.fn(() => path.join("/tmp", "yt-dlp-gui-test")),
    },
    net: {
      request: jest.fn(),
    },
  };
});

// Helper: load router with isolated module cache per test
const loadRouter = async () => {
  const mod = await import("../index");
  return mod.ytdlpRouter;
};

describe("ytdlp router", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("getInstallInfo returns not installed when binary missing", async () => {
    // fs.existsSync -> false for everything
    jest.spyOn(fs, "existsSync").mockReturnValue(false);

    const ytdlpRouter = await loadRouter();
    const caller = ytdlpRouter.createCaller({});
    const info = await caller.getInstallInfo();
    expect(info.installed).toBe(false);
    expect(info.path).toBeNull();
    expect(info.version).toBeNull();
  });

  test("getInstallInfo returns installed with version when files exist", async () => {
    const binDir = path.join("/tmp", "yt-dlp-gui-test", "bin");
    const binPath = path.join(binDir, process.platform === "win32" ? "yt-dlp.exe" : process.platform === "darwin" ? "yt-dlp_macos" : "yt-dlp");
    const versionPath = path.join(binDir, "yt-dlp-version.txt");

    jest
      .spyOn(fs, "existsSync")
      .mockImplementation((p: any) => [binDir, binPath, versionPath].includes(p));
    jest.spyOn(fs, "readFileSync").mockReturnValue("2025.10.28");

    const ytdlpRouter = await loadRouter();
    const caller = ytdlpRouter.createCaller({});
    const info = await caller.getInstallInfo();
    expect(info.installed).toBe(true);
    expect(info.path).toBe(binPath);
    expect(info.version).toBe("2025.10.28");
  });

  test("resolveLatest parses tag and asset url from GitHub JSON", async () => {
    const assetName = process.platform === "win32" ? "yt-dlp.exe" : process.platform === "darwin" ? "yt-dlp_macos" : "yt-dlp";
    const mockedJson = {
      tag_name: "v2025.10.28",
      assets: [
        { name: assetName, browser_download_url: "https://example.com/yt-dlp" },
        { name: "other", browser_download_url: "https://example.com/other" },
      ],
    };

    (globalThis as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockedJson });

    const ytdlpRouter = await loadRouter();
    const caller = ytdlpRouter.createCaller({});
    const res = await caller.resolveLatest();
    expect(res?.version).toBe("2025.10.28");
    expect(res?.assetUrl).toBe("https://example.com/yt-dlp");
  });

  test("downloadLatest returns early when already installed (no force)", async () => {
    const binDir = path.join("/tmp", "yt-dlp-gui-test", "bin");
    const binPath = path.join(binDir, process.platform === "win32" ? "yt-dlp.exe" : process.platform === "darwin" ? "yt-dlp_macos" : "yt-dlp");
    const versionPath = path.join(binDir, "yt-dlp-version.txt");

    jest
      .spyOn(fs, "existsSync")
      .mockImplementation((p: any) => [binDir, binPath, versionPath].includes(p));
    jest.spyOn(fs, "readFileSync").mockReturnValue("2025.10.28");

    const ytdlpRouter = await loadRouter();
    const caller = ytdlpRouter.createCaller({});
    const res = await caller.downloadLatest();
    expect(res.success).toBe(true);
    expect(res.alreadyInstalled).toBe(true);
    expect(res.path).toBe(binPath);
    expect(res.version).toBe("2025.10.28");
  });

  test("downloadLatest with force downloads and installs (mocked)", async () => {
    const { net } = await import("electron");

    // Mock fetch for release resolution
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: "v2025.10.28", assets: [] }), // no assets -> router falls back to direct latest URL
    });

    // Ensure bin does not exist initially
    jest.spyOn(fs, "existsSync").mockReturnValue(false);

    // Mock createWriteStream to simulate writing to tmp file
    const ws = { write: jest.fn(), end: jest.fn(), destroy: jest.fn() } as any;
    jest.spyOn(fs, "createWriteStream").mockReturnValue(ws);

    // Mock finalize steps
    const copySpy = jest.spyOn(fs, "copyFileSync").mockImplementation(() => {});
    const unlinkSpy = jest.spyOn(fs, "unlinkSync").mockImplementation(() => {});
    const chmodSpy = jest.spyOn(fs, "chmodSync").mockImplementation(() => {});
    const writeFileSpy = jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    // Mock net.request -> immediately call response with a 200 OK and then end
    (net.request as jest.Mock).mockImplementation(() => {
      const listeners: Record<string, Function[]> = {};
      return {
        on: (event: string, cb: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(cb);
          // Trigger response on next tick
          if (event === "response") {
            setImmediate(() => {
              const responseListeners: Record<string, Function[]> = {};
              const resp = {
                statusCode: 200,
                headers: {},
                on: (ev: string, handler: Function) => {
                  responseListeners[ev] = responseListeners[ev] || [];
                  responseListeners[ev].push(handler);
                },
              } as any;
              // Notify 'response'
              listeners["response"].forEach((fn) => fn(resp));
              // Simulate data then end
              setImmediate(() => {
                (responseListeners["data"] || []).forEach((fn) => fn(Buffer.from("abc")));
                (responseListeners["end"] || []).forEach((fn) => fn());
              });
            });
          }
          return this;
        },
        end: () => {},
      } as any;
    });

    const ytdlpRouter = await loadRouter();
    const caller = ytdlpRouter.createCaller({});
    const res = await caller.downloadLatest({ force: true });

    expect(res.success).toBe(true);
    expect(copySpy).toHaveBeenCalled();
    expect(unlinkSpy).toHaveBeenCalled();
    if (process.platform !== "win32") {
      expect(chmodSpy).toHaveBeenCalled();
    }
    expect(writeFileSpy).toHaveBeenCalled();
  });
});
