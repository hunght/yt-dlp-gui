import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { eq, desc, and, gte } from "drizzle-orm";
import { downloads } from "@/api/db/schema";

const YTDlpWrapModule = require("yt-dlp-wrap");
const YTDlpWrap = YTDlpWrapModule.default;

export interface SystemHealthResult {
  ytDlpVersion: string | null;
  ytDlpAvailable: boolean;
  ffmpegAvailable: boolean;
  ffmpegVersion: string | null;
  pythonVersion: string | null;
  networkConnectivity: boolean;
  status: "healthy" | "warning" | "error";
  issues: string[];
}

export interface PerformanceMetrics {
  avgDownloadSpeed: number;
  successRate: number;
  failedDownloads: number;
  totalDownloads: number;
  recentSuccessRate: number;
  commonErrors: Array<{ error: string; count: number }>;
}

export interface DiagnosticResult {
  testName: string;
  passed: boolean;
  message: string;
  details?: string;
  recommendation?: string;
}

export interface TubeDoctorReport {
  systemHealth: SystemHealthResult;
  performanceMetrics: PerformanceMetrics;
  diagnosticTests: DiagnosticResult[];
  recommendations: string[];
  overallStatus: "healthy" | "warning" | "critical";
}

// Helper function to check if a command exists
const checkCommandExists = async (command: string): Promise<boolean> => {
  try {
    const { exec } = require("child_process");
    return new Promise((resolve) => {
      exec(`which ${command}`, (error: any) => {
        resolve(!error);
      });
    });
  } catch {
    return false;
  }
};

// Helper function to get command version
const getCommandVersion = async (command: string, versionFlag = "--version"): Promise<string | null> => {
  try {
    const { exec } = require("child_process");
    return new Promise((resolve) => {
      exec(`${command} ${versionFlag}`, { timeout: 5000 }, (error: any, stdout: string) => {
        if (error) {
          resolve(null);
        } else {
          // Extract version from stdout (first line usually contains version)
          const firstLine = stdout.split('\n')[0];
          resolve(firstLine.trim());
        }
      });
    });
  } catch {
    return null;
  }
};

// Check system health
const checkSystemHealth = async (): Promise<SystemHealthResult> => {
  const issues: string[] = [];
  let status: "healthy" | "warning" | "error" = "healthy";

  // Check yt-dlp availability and version
  let ytDlpAvailable = false;
  let ytDlpVersion: string | null = null;

  try {
    const ytDlpWrap = new YTDlpWrap();
    // Try to get version using yt-dlp-wrap
    const version = await ytDlpWrap.execPromise(["--version"]);
    ytDlpAvailable = true;
    ytDlpVersion = version.trim();
  } catch (error) {
    ytDlpAvailable = false;
    issues.push("yt-dlp is not available or not functioning properly");
    status = "error";
  }

  // Check ffmpeg availability
  const ffmpegAvailable = await checkCommandExists("ffmpeg");
  let ffmpegVersion: string | null = null;

  if (ffmpegAvailable) {
    ffmpegVersion = await getCommandVersion("ffmpeg", "-version");
  } else {
    issues.push("ffmpeg is not available - some features may not work");
    if (status !== "error") status = "warning";
  }

  // Check Python availability
  const pythonVersion = await getCommandVersion("python3", "--version");
  if (!pythonVersion) {
    issues.push("Python 3 is not available in PATH");
    if (status !== "error") status = "warning";
  }

  // Check network connectivity with a simple test
  let networkConnectivity = false;
  try {
    const https = require("https");
    networkConnectivity = await new Promise((resolve) => {
      const req = https.get("https://www.youtube.com", { timeout: 5000 }, () => {
        resolve(true);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => resolve(false));
    });
  } catch {
    networkConnectivity = false;
  }

  if (!networkConnectivity) {
    issues.push("Network connectivity issues detected");
    status = "error";
  }

  return {
    ytDlpVersion,
    ytDlpAvailable,
    ffmpegAvailable,
    ffmpegVersion,
    pythonVersion,
    networkConnectivity,
    status,
    issues,
  };
};

// Calculate performance metrics from download history
const calculatePerformanceMetrics = async (db: any): Promise<PerformanceMetrics> => {
  try {
    // Get all downloads
    const allDownloads = await db.select().from(downloads).orderBy(desc(downloads.createdAt));

    const totalDownloads = allDownloads.length;
    const completedDownloads = allDownloads.filter((d: any) => d.status === "completed");
    const failedDownloads = allDownloads.filter((d: any) => d.status === "failed");

    const successRate = totalDownloads > 0 ? (completedDownloads.length / totalDownloads) * 100 : 0;

    // Get recent downloads (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentDownloads = allDownloads.filter((d: any) =>
      new Date(d.createdAt) >= thirtyDaysAgo
    );
    const recentCompleted = recentDownloads.filter((d: any) => d.status === "completed");
    const recentSuccessRate = recentDownloads.length > 0 ?
      (recentCompleted.length / recentDownloads.length) * 100 : 0;

    // Calculate average download speed from completed downloads
    const downloadsWithSpeed = completedDownloads.filter((d: any) => d.fileSize && d.downloadTime);
    const avgDownloadSpeed = downloadsWithSpeed.length > 0 ?
      downloadsWithSpeed.reduce((sum: number, d: any) => {
        // fileSize in bytes, downloadTime in seconds -> MB/s
        const speed = (d.fileSize / (1024 * 1024)) / d.downloadTime;
        return sum + speed;
      }, 0) / downloadsWithSpeed.length : 0;

    // Analyze common errors
    const errorCounts: { [key: string]: number } = {};
    failedDownloads.forEach((d: any) => {
      if (d.error) {
        const errorKey = d.error.substring(0, 100); // Truncate for grouping
        errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;
      }
    });

    const commonErrors = Object.entries(errorCounts)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 errors

    return {
      avgDownloadSpeed,
      successRate,
      failedDownloads: failedDownloads.length,
      totalDownloads,
      recentSuccessRate,
      commonErrors,
    };
  } catch (error) {
    logger.error("Failed to calculate performance metrics:", error);
    return {
      avgDownloadSpeed: 0,
      successRate: 0,
      failedDownloads: 0,
      totalDownloads: 0,
      recentSuccessRate: 0,
      commonErrors: [],
    };
  }
};

// Run diagnostic tests based on yt-dlp FAQ common issues
const runDiagnosticTests = async (): Promise<DiagnosticResult[]> => {
  const tests: DiagnosticResult[] = [];
  const ytDlpWrap = new YTDlpWrap();

  // Test 1: Basic yt-dlp functionality
  try {
    await ytDlpWrap.execPromise(["--version"]);
    tests.push({
      testName: "yt-dlp Version Check",
      passed: true,
      message: "yt-dlp is working correctly",
    });
  } catch (error) {
    tests.push({
      testName: "yt-dlp Version Check",
      passed: false,
      message: "yt-dlp is not functioning properly",
      details: error instanceof Error ? error.message : "Unknown error",
      recommendation: "Try updating yt-dlp or reinstalling the application",
    });
  }

  // Test 2: YouTube accessibility (using a reliable test video)
  try {
    const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; // Rick Roll - very stable
    await ytDlpWrap.execPromise([testUrl, "--dump-json", "--no-warnings"]);
    tests.push({
      testName: "YouTube Accessibility",
      passed: true,
      message: "Can access YouTube videos successfully",
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    let recommendation = "Check your internet connection";

    if (errorMsg.includes("403")) {
      recommendation = "HTTP 403 error detected. Try using cookies from your browser or a VPN";
    } else if (errorMsg.includes("429")) {
      recommendation = "Rate limited by YouTube. Wait a few minutes and try again";
    } else if (errorMsg.includes("region")) {
      recommendation = "Region blocking detected. Consider using a VPN";
    }

    tests.push({
      testName: "YouTube Accessibility",
      passed: false,
      message: "Cannot access YouTube videos",
      details: errorMsg,
      recommendation,
    });
  }

  // Test 3: Format availability
  try {
    const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    await ytDlpWrap.execPromise([testUrl, "--list-formats", "--no-warnings"]);
    tests.push({
      testName: "Format Detection",
      passed: true,
      message: "Can detect available video formats",
    });
  } catch (error) {
    tests.push({
      testName: "Format Detection",
      passed: false,
      message: "Cannot detect video formats",
      details: error instanceof Error ? error.message : "Unknown error",
      recommendation: "This may indicate network or authentication issues",
    });
  }

  // Test 4: Format download simulation
  try {
    const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    await ytDlpWrap.execPromise([testUrl, "-f", "bestaudio", "--simulate", "--no-warnings"]);
    tests.push({
      testName: "Download Simulation",
      passed: true,
      message: "Can simulate downloads successfully",
    });
  } catch (error) {
    tests.push({
      testName: "Download Simulation",
      passed: false,
      message: "Download simulation failed",
      details: error instanceof Error ? error.message : "Unknown error",
      recommendation: "Check format availability and network connectivity",
    });
  }

  // Test 5: Network connectivity to different domains
  const testDomains = ["youtube.com", "googlevideo.com", "ytimg.com"];
  let accessibleDomains = 0;

  for (const domain of testDomains) {
    try {
      const https = require("https");
      const accessible = await new Promise((resolve) => {
        const req = https.get(`https://${domain}`, { timeout: 5000 }, () => {
          resolve(true);
        });
        req.on("error", () => resolve(false));
        req.on("timeout", () => resolve(false));
      });
      if (accessible) accessibleDomains++;
    } catch {
      // Continue checking other domains
    }
  }

  tests.push({
    testName: "Network Connectivity",
    passed: accessibleDomains === testDomains.length,
    message: `${accessibleDomains}/${testDomains.length} essential domains accessible`,
    recommendation: accessibleDomains < testDomains.length ?
      "Some YouTube domains are not accessible. Check your network or firewall settings" : undefined,
  });

  return tests;
};

export const tubeDoctorRouter = t.router({
  // Get system health information
  getSystemHealth: publicProcedure.query(async (): Promise<SystemHealthResult> => {
    return checkSystemHealth();
  }),

  // Get performance metrics from download history
  getPerformanceMetrics: publicProcedure.query(async ({ ctx }): Promise<PerformanceMetrics> => {
    return calculatePerformanceMetrics(ctx.db);
  }),

  // Run all diagnostic tests
  runDiagnostics: publicProcedure.query(async (): Promise<DiagnosticResult[]> => {
    return runDiagnosticTests();
  }),

  // Run full tube doctor analysis
  runFullDiagnostics: publicProcedure.query(async ({ ctx }): Promise<TubeDoctorReport> => {
    const [systemHealth, performanceMetrics, diagnosticTests] = await Promise.all([
      checkSystemHealth(),
      calculatePerformanceMetrics(ctx.db),
      runDiagnosticTests(),
    ]);

    const recommendations: string[] = [];

    // Generate recommendations based on results
    if (!systemHealth.ytDlpAvailable) {
      recommendations.push("Install or update yt-dlp to the latest version");
    }

    if (!systemHealth.ffmpegAvailable) {
      recommendations.push("Install ffmpeg for video processing capabilities");
    }

    if (!systemHealth.networkConnectivity) {
      recommendations.push("Check your internet connection and firewall settings");
    }

    if (performanceMetrics.successRate < 80) {
      recommendations.push("Low success rate detected. Consider updating yt-dlp or checking for network issues");
    }

    const failedTests = diagnosticTests.filter(test => !test.passed);
    failedTests.forEach(test => {
      if (test.recommendation) {
        recommendations.push(test.recommendation);
      }
    });

    // Determine overall status
    let overallStatus: "healthy" | "warning" | "critical" = "healthy";

    if (systemHealth.status === "error" || failedTests.length >= 3) {
      overallStatus = "critical";
    } else if (systemHealth.status === "warning" || failedTests.length > 0 || performanceMetrics.successRate < 90) {
      overallStatus = "warning";
    }

    return {
      systemHealth,
      performanceMetrics,
      diagnosticTests,
      recommendations: [...new Set(recommendations)], // Remove duplicates
      overallStatus,
    };
  }),

  // Test a specific URL for diagnostics
  testUrl: publicProcedure
    .input(z.object({ url: z.string().url() }))
    .query(async ({ input }): Promise<DiagnosticResult> => {
      try {
        const ytDlpWrap = new YTDlpWrap();

        // Test video info extraction
        await ytDlpWrap.execPromise([input.url, "--dump-json", "--no-warnings"]);

        // Test format listing
        await ytDlpWrap.execPromise([input.url, "--list-formats", "--no-warnings"]);

        // Test download simulation
        await ytDlpWrap.execPromise([input.url, "-f", "bestaudio", "--simulate", "--no-warnings"]);

        return {
          testName: "URL Test",
          passed: true,
          message: "URL is accessible and downloadable",
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        let recommendation = "Check if the URL is valid and accessible";

        if (errorMsg.includes("403")) {
          recommendation = "HTTP 403: Try using cookies from your browser or check if content is region-locked";
        } else if (errorMsg.includes("429")) {
          recommendation = "HTTP 429: Rate limited. Wait a few minutes before trying again";
        } else if (errorMsg.includes("404")) {
          recommendation = "Content not found. The video may be private, deleted, or the URL is incorrect";
        } else if (errorMsg.includes("region")) {
          recommendation = "Content is region-locked. Consider using a VPN";
        }

        return {
          testName: "URL Test",
          passed: false,
          message: "URL test failed",
          details: errorMsg,
          recommendation,
        };
      }
    }),

  // Clear yt-dlp cache
  clearCache: publicProcedure.mutation(async (): Promise<{ success: boolean; message: string }> => {
    try {
      const ytDlpWrap = new YTDlpWrap();
      await ytDlpWrap.execPromise(["--rm-cache-dir"]);
      return {
        success: true,
        message: "yt-dlp cache cleared successfully",
      };
    } catch (error) {
      logger.error("Failed to clear cache:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to clear cache",
      };
    }
  }),
});
