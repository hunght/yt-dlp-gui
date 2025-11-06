import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { shell, net, app } from "electron";
import {
  createNotificationWindow,
  closeNotificationWindow as closeWindow,
} from "@/main/windows/notification";
import { sendNotificationToWindow } from "@/helpers/notification/notification-window-utils";
import { buildAppLinks } from "@/config/app-links";

import { logger } from "@/helpers/logger";
import path from "path";
import fs from "fs";
import os from "os";
import { extractZipWithYauzl } from "./service";
import { getDatabasePath } from "@/utils/paths";
import { translationCache, translationContexts } from "@yt-dlp-gui/database";
import crypto from "crypto";

//   a function to get platform-specific download URL without triggering download
const getPlatformDownloadUrl = (version: string): string => {
  const customAppLinks = buildAppLinks(version);
  // Use Electron's process.platform for platform detection
  switch (process.platform) {
    case "win32":
      return customAppLinks.windows;
    case "darwin":
      // For macOS, check if running on ARM
      return process.arch === "arm64"
        ? customAppLinks.macos
        : customAppLinks.macosIntel || customAppLinks.macos;
    case "linux":
      return customAppLinks.linux;
    default:
      return customAppLinks.releases;
  }
};
export const utilsRouter = t.router({
  openExternalUrl: publicProcedure
    .input(
      z.object({
        url: z.string().url(),
      })
    )
    .mutation(async ({ input }) => {
      const success = await shell.openExternal(input.url);
      return { success };
    }),

  // Get AI explanation for a word (fun and easy to remember)
  explainWord: publicProcedure
    .input(
      z.object({
        word: z.string().min(1),
        language: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        // Extract the first word and clean it
        const cleanWord = input.word.split(/\s+/)[0].replace(/[.,!?;:()\[\]'"\-–—]/g, "").toLowerCase();
        const langCode = input.language ? input.language.split("-")[0] : "en";

        // For now, use a simple approach: call a free dictionary API and enhance with a fun explanation
        // You can replace this with OpenAI/Anthropic API later
        const dictionaryApiUrl = `https://api.dictionaryapi.dev/api/v2/entries/${langCode}/${encodeURIComponent(cleanWord)}`;

        try {
          const response = await fetch(dictionaryApiUrl);
          if (response.ok) {
            const data = await response.json();
            const firstEntry = Array.isArray(data) ? data[0] : data;

            // Extract definition and example
            const meanings = firstEntry.meanings || [];
            const firstMeaning = meanings[0];
            const definition = firstMeaning?.definitions?.[0]?.definition || "";
            const example = firstMeaning?.definitions?.[0]?.example || "";
            const partOfSpeech = firstMeaning?.partOfSpeech || "";

            // Create a fun, memorable explanation with engaging formatting
            let funExplanation = `📚 **${cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1)}**`;

            if (partOfSpeech) {
              funExplanation += ` (${partOfSpeech})`;
            }

            funExplanation += `\n\n${definition || `A word you're learning in ${langCode.toUpperCase()}!`}`;

            if (example) {
              funExplanation += `\n\n✨ *Example: "${example}"*`;
            }

            funExplanation += `\n\n💡 *Memory tip: Try using this word in a sentence right now - practice makes perfect! 💪*`;

            return {
              success: true as const,
              word: cleanWord,
              explanation: funExplanation,
              pronunciation: firstEntry.phonetic || firstEntry.phonetics?.[0]?.text || "",
            };
          }
        } catch (e) {
          logger.debug("[word-explanation] Dictionary API failed, will open ChatGPT", { word: cleanWord, error: String(e) });
        }

        // Fallback: Return flag to open ChatGPT with word query
        return {
          success: false as const,
          shouldOpenChatGPT: true as const,
          word: cleanWord,
          language: langCode,
        };
      } catch (e) {
        logger.error("[word-explanation] Failed to explain word", { word: input.word, error: String(e) });
        return {
          success: false as const,
          message: "Failed to get word explanation",
        };
      }
    }),

  // Translate text using Google Translate with database caching
  translateText: publicProcedure
    .input(
      z.object({
        text: z.string().min(1),
        targetLang: z.string().default("en"), // Default to English
        sourceLang: z.string().optional(), // Auto-detect if not provided
        // Required video context for linking translation to specific moment
        videoId: z.string().min(1),
        timestampSeconds: z.number(),
        contextText: z.string().optional(), // Context text can be optional
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const { text, targetLang, sourceLang } = input;
        const db = ctx.db;

        // Clean the text
        const cleanText = text.trim();
        const sl = sourceLang || "auto"; // auto-detect source language
        const tl = targetLang;

        // Check cache first
        if (db) {
          try {
            const { eq, and } = await import("drizzle-orm");

            const cached = await db
              .select()
              .from(translationCache)
              .where(
                and(
                  eq(translationCache.sourceText, cleanText),
                  eq(translationCache.sourceLang, sl),
                  eq(translationCache.targetLang, tl)
                )
              )
              .limit(1);

            if (cached.length > 0) {
              const cachedEntry = cached[0];

              logger.debug("[translation] Cache hit", {
                sourceText: cleanText,
                sourceLang: sl,
                targetLang: tl,
                queryCount: cachedEntry.queryCount,
              });

              // Update query tracking: increment count and update timestamp
              try {
                const now = Date.now();
                await db
                  .update(translationCache)
                  .set({
                    queryCount: (cachedEntry.queryCount || 0) + 1,
                    lastQueriedAt: now,
                    updatedAt: now,
                  })
                  .where(eq(translationCache.id, cachedEntry.id));

                logger.debug("[translation] Updated query count", {
                  id: cachedEntry.id,
                  newCount: (cachedEntry.queryCount || 0) + 1,
                });
              } catch (updateError) {
                logger.warn("[translation] Failed to update query count", {
                  error: String(updateError),
                });
                // Don't fail the translation if update fails
              }

              // Save video context
              try {
                const now = Date.now();

                await db.insert(translationContexts).values({
                  id: crypto.randomUUID(),
                  translationId: cachedEntry.id,
                  videoId: input.videoId,
                  timestampSeconds: Math.floor(input.timestampSeconds),
                  contextText: input.contextText || null,
                  createdAt: now,
                }).onConflictDoNothing(); // Ignore if duplicate

                logger.debug("[translation] Saved video context", {
                  translationId: cachedEntry.id,
                  videoId: input.videoId,
                  timestamp: input.timestampSeconds,
                });
              } catch (contextError) {
                logger.warn("[translation] Failed to save video context", {
                  error: String(contextError),
                });
              }

              return {
                success: true as const,
                translation: cachedEntry.translatedText,
                translationId: cachedEntry.id, // Include translation ID for saving to My Words
                originalText: cleanText,
                sourceLang: cachedEntry.detectedLang || sl,
                targetLang: tl,
                fromCache: true,
                queryCount: (cachedEntry.queryCount || 0) + 1,
              };
            }
          } catch (cacheError) {
            logger.warn("[translation] Cache lookup failed", {
              error: String(cacheError),
            });
            // Continue to API call if cache fails
          }
        }

        // Use Google Translate's free endpoint
        // Format: https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=hello
        const encodedText = encodeURIComponent(cleanText);
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodedText}`;

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Translation API returned ${response.status}`);
        }

        const data = await response.json();

        // Parse the response
        // Google Translate API returns: [[[translatedText, originalText, null, null, translatedWordCount]]]
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const translations = data[0];
          const translatedText = translations
            .filter((item: any) => Array.isArray(item) && item[0])
            .map((item: any) => item[0])
            .join("");

          // Detect source language (data[2] contains detected language)
          const detectedLang = data[2] || sl;

          // Store in cache for future use
          if (db) {
            try {
              const cacheId = crypto.randomUUID();
              const now = Date.now();
              const { sql } = await import("drizzle-orm");

              // Use upsert: insert or update if already exists, return the record
              const [upsertedRecord] = await db.insert(translationCache).values({
                id: cacheId,
                sourceText: cleanText,
                sourceLang: sl,
                targetLang: tl,
                translatedText,
                detectedLang,
                queryCount: 1, // First query for this translation
                firstQueriedAt: now, // Record when user first encountered this
                lastQueriedAt: now, // Same as first for initial entry
                createdAt: now,
                updatedAt: now,
              }).onConflictDoUpdate({
                target: [translationCache.sourceText, translationCache.sourceLang, translationCache.targetLang],
                set: {
                  queryCount: sql`${translationCache.queryCount} + 1`,
                  lastQueriedAt: now,
                  updatedAt: now,
                },
              }).returning();

              const actualCacheId = upsertedRecord.id;

              logger.debug("[translation] Cached translation", {
                sourceText: cleanText,
                sourceLang: sl,
                targetLang: tl,
                queryCount: upsertedRecord.queryCount,
              });

              // Save video context
              try {
                await db.insert(translationContexts).values({
                  id: crypto.randomUUID(),
                  translationId: actualCacheId,
                  videoId: input.videoId,
                  timestampSeconds: Math.floor(input.timestampSeconds),
                  contextText: input.contextText || null,
                  createdAt: now,
                }).onConflictDoNothing();

                logger.debug("[translation] Saved video context for new translation", {
                  translationId: actualCacheId,
                  videoId: input.videoId,
                  timestamp: input.timestampSeconds,
                });
              } catch (contextError) {
                logger.warn("[translation] Failed to save video context", {
                  error: String(contextError),
                });
              }

              // Return with translationId for saving to My Words
              return {
                success: true as const,
                translation: translatedText,
                translationId: actualCacheId,
                originalText: cleanText,
                sourceLang: detectedLang,
                targetLang: tl,
                fromCache: false,
              };
            } catch (cacheError) {
              logger.warn("[translation] Failed to cache translation", {
                error: String(cacheError),
              });
              // Don't fail the translation if caching fails
            }
          }

          return {
            success: true as const,
            translation: translatedText,
            translationId: '', // No ID if caching failed
            originalText: cleanText,
            sourceLang: detectedLang,
            targetLang: tl,
            fromCache: false,
          };
        }

        throw new Error("Unexpected response format from translation API");
      } catch (e) {
        logger.error("[translation] Failed to translate text", {
          text: input.text,
          error: String(e)
        });
        return {
          success: false as const,
          message: `Translation failed: ${String(e)}`,
        };
      }
    }),

  openLocalFile: publicProcedure
    .input(
      z.object({
        filePath: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await shell.openPath(input.filePath);
        return { success: true };
      } catch (error) {
        logger.error("Failed to open local file:", error);
        return { success: false, error: String(error) };
      }
    }),

  openFolder: publicProcedure
    .input(
      z.object({
        folderPath: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await shell.openPath(input.folderPath);
        return { success: true };
      } catch (error) {
        logger.error("Failed to open folder:", error);
        return { success: false, error: String(error) };
      }
    }),

  quitApp: publicProcedure.mutation(async () => {
    try {
      logger.info("Quitting application...");
      app.quit();
      return { success: true };
    } catch (error) {
      logger.error("Failed to quit app:", error);
      return { success: false, error: String(error) };
    }
  }),

  // Get current app version
  getAppVersion: publicProcedure.query(() => {
    return app.getVersion();
  }),

  // Get log file content
  getLogFileContent: publicProcedure.query(async () => {
    try {
      const logFileContent = await logger.getFileContent();
      return logFileContent;
    } catch (error) {
      logger.error("Failed to get log file content", error);
      throw error;
    }
  }),

  // Clear log file content
  clearLogFile: publicProcedure.mutation(async () => {
    try {
      await logger.clearLogFile();
      return { success: true } as const;
    } catch (error) {
      logger.error("Failed to clear log file", error);
      return { success: false, error: String(error) } as const;
    }
  }),

  openNotificationWindow: publicProcedure
    .input(
      z
        .object({
          title: z.string(),
          description: z.string(),
          autoDismiss: z.boolean().optional(), // Optional auto-dismiss setting
        })
        .optional()
    )
    .mutation(async ({ input }) => {
      try {
        const window = createNotificationWindow();

        // If data is provided, send it to the notification window
        if (input && window) {
          const success = await sendNotificationToWindow({
            title: input.title,
            body: input.description,
            autoDismiss: input.autoDismiss ?? false, // Default is false
          });
          return { success };
        }

        return { success: !!window };
      } catch (error) {
        console.error("Failed to open notification window:", error);
        return { success: false, error: String(error) };
      }
    }),

  // Version checking procedure
  checkForUpdates: publicProcedure.query(async () => {
    return {status: "success", currentVersion: "1.0.001"};
    try {
      logger.info("Checking for updates...");
      const currentVersion = app.getVersion();
      logger.info(`Current app version: ${currentVersion}`);

      // Fetch the latest release from GitHub
      const response = await fetch(
        "https://api.github.com/repos/your-org/yt-dlp-gui/releases/latest"
      );

      if (!response.ok) {
        logger.error(`Failed to fetch latest release: ${response.statusText}`);
        return {
          status: "error" as const,
          message: "Failed to check for updates. Please try again later.",
          hasUpdate: false,
        };
      }

      const release = await response.json();
      const latestVersion = release.tag_name.replace("v", "");
      const downloadUrl = getPlatformDownloadUrl(latestVersion);

      logger.info(`Latest version available: ${latestVersion}`);

      // Compare versions (simple string comparison, assuming semver format)
      const hasUpdate = latestVersion > currentVersion;

      return {
        status: "success" as const,
        message: hasUpdate
          ? `Update available: ${latestVersion}`
          : "You are using the latest version.",
        hasUpdate,
        currentVersion,
        latestVersion,
        downloadUrl,
      };
    } catch (error) {
      logger.error("Failed to check for updates", error);
      return {
        status: "error" as const,
        message: "Failed to check for updates. Please try again later.",
        hasUpdate: false,
      };
    }
  }),

  // Download update procedure with progress tracking
  downloadUpdate: publicProcedure
    .input(
      z.object({
        downloadUrl: z.string().url(),
      })
    )
    .mutation(async ({ input }) => {
      const { downloadUrl } = input;

      try {
        logger.info("Starting download from:", downloadUrl);

        // Get the download directory
        const downloadsDir = path.join(os.homedir(), "Downloads");

        // Extract filename from URL
        const urlParts = downloadUrl.split("/");
        const filename = urlParts[urlParts.length - 1] || "yt-dlp-gui-update.dmg";
        const filePath = path.join(downloadsDir, filename);

        // Ensure downloads directory exists
        if (!fs.existsSync(downloadsDir)) {
          fs.mkdirSync(downloadsDir, { recursive: true });
        }

        return new Promise<{
          status: "success" | "error";
          message: string;
          filePath?: string;
          filename?: string;
        }>(async (resolve, reject) => {
          // Helper to perform download and follow redirects up to maxRedirects
          const maxRedirects = 5;

          const doRequest = (urlToFetch: string, redirectsLeft: number) => {
            let request;
            try {
              request = net.request({ method: "GET", url: urlToFetch });
            } catch (err) {
              logger.error("Failed to create net.request:", err);
              return reject({
                status: "error",
                message: `Failed to start download: ${String(err)}`,
              });
            }

            request.on("response", (response) => {
              const statusCode = response.statusCode || 0;
              logger.info(`Download response status: ${statusCode}`);

              // Handle redirects manually
              if (statusCode >= 300 && statusCode < 400 && redirectsLeft > 0) {
                const locationHeader = response.headers["location"] || response.headers["Location"];
                const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;
                if (location) {
                  logger.info("Redirecting download to:", location);
                  // Drain response and start new request to location
                  response.on("data", () => {});
                  response.on("end", () => {
                    doRequest(location, redirectsLeft - 1);
                  });
                  return;
                }
              }

              if (statusCode >= 400) {
                logger.error(
                  "Download failed, status code:",
                  statusCode,
                  "headers:",
                  response.headers
                );
                // consume response and reject
                response.on("data", () => {});
                response.on("end", () => {
                  reject({ status: "error", message: `Download failed with status ${statusCode}` });
                });
                return;
              }

              logger.info(
                `Starting download, content-length: ${response.headers["content-length"] || "unknown"} bytes`
              );

              const writeStream = fs.createWriteStream(filePath);

              response.on("data", (chunk) => {
                writeStream.write(chunk);
              });

              response.on("end", () => {
                writeStream.end();
                logger.info("Download completed:", filePath);

                resolve({
                  status: "success",
                  message: "Download completed successfully",
                  filePath,
                  filename,
                });
              });

              response.on("error", (error) => {
                writeStream.destroy();
                logger.error("Download stream error:", error);
                reject({
                  status: "error",
                  message: "Download failed",
                });
              });
            });

            request.on("error", (error) => {
              logger.error("Download request error:", error);
              reject({
                status: "error",
                message: `Failed to start download: ${String(error)}`,
              });
            });

            request.end();
          };

          // Kick off the request
          doRequest(downloadUrl, maxRedirects);
        });
      } catch (error) {
        logger.error("Failed to download update", error);
        return {
          status: "error" as const,
          message: "Failed to download update",
        };
      }
    }),

  closeNotificationWindow: publicProcedure.mutation(() => {
    try {
      closeWindow();
      return { success: true };
    } catch (error) {
      console.error("Failed to close notification window:", error);
      return { success: false, error: String(error) };
    }
  }),
  // Check if update file already exists
  checkExistingUpdate: publicProcedure
    .input(
      z.object({
        version: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { version } = input;

      try {
        // Use a more reliable way to detect platform in main process
        const platform = process.platform;
        const arch = process.arch;
        const expectedFilename = `itracksy-${platform}-${arch}-${version}.zip`;
        const downloadsDir = path.join(os.homedir(), "Downloads");
        const expectedPath = path.join(downloadsDir, expectedFilename);

        // Check if file exists
        if (fs.existsSync(expectedPath)) {
          logger.info("Found existing downloaded file:", expectedPath);
          return {
            exists: true,
            filePath: expectedPath,
          };
        }

        return {
          exists: false,
          filePath: null,
        };
      } catch (error) {
        logger.error("Error checking for existing file:", error);
        return {
          exists: false,
          filePath: null,
          error: String(error),
        };
      }
    }),
  // Direct notification send procedure (uses the new IPC channel)
  sendNotification: publicProcedure
    .input(
      z.object({
        title: z.string(),
        description: z.string(),
        autoDismiss: z.boolean().optional(), // Optional auto-dismiss setting
      })
    )
    .mutation(async ({ input }) => {
      try {
        const success = await sendNotificationToWindow({
          title: input.title,
          body: input.description,
          autoDismiss: input.autoDismiss ?? false, // Default is false
        });

        return { success };
      } catch (error) {
        console.error("Failed to send notification:", error);
        return { success: false, error: String(error) };
      }
    }),
  installUpdate: publicProcedure
    .input(
      z.object({
        zipFilePath: z.string(),
        version: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { zipFilePath, version } = input;

      try {
        logger.info(`Installing update from ZIP file: ${zipFilePath}`);

        // Check if ZIP file exists
        if (!fs.existsSync(zipFilePath)) {
          throw new Error(`ZIP file not found: ${zipFilePath}`);
        }

        // Wait and retry mechanism for file system operations
        let zipStats: fs.Stats | undefined;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 + retryCount * 1000));

          zipStats = fs.statSync(zipFilePath);
          logger.info(`Attempt ${retryCount + 1}: ZIP file size: ${zipStats.size} bytes`);

          if (zipStats.size === 0) {
            logger.error(`Attempt ${retryCount + 1}: ZIP file is empty`);
            if (retryCount === maxRetries - 1) {
              throw new Error("ZIP file is empty after multiple attempts");
            }
            retryCount++;
            continue;
          }

          // Check if file size is reasonable (should be around 114MB)
          if (zipStats.size < 100000000) {
            logger.error(
              `Attempt ${retryCount + 1}: ZIP file size seems too small: ${zipStats.size} bytes. Expected around 114MB.`
            );
            if (retryCount === maxRetries - 1) {
              throw new Error(
                `ZIP file appears to be truncated after ${maxRetries} attempts. Size: ${zipStats.size} bytes, expected ~114MB`
              );
            }
            retryCount++;
            continue;
          }

          // File size looks good, break out of retry loop
          logger.info(`ZIP file size validation passed on attempt ${retryCount + 1}`);
          break;
        }

        // Ensure zipStats is defined
        if (!zipStats) {
          throw new Error("Failed to get valid ZIP file stats after all retry attempts");
        }

        // Basic ZIP file validation - check for ZIP signature
        const fd = fs.openSync(zipFilePath, "r");
        const zipBuffer = Buffer.alloc(4);
        fs.readSync(fd, zipBuffer, 0, 4, 0);
        fs.closeSync(fd);
        const zipSignature = zipBuffer.toString("hex");

        // ZIP files should start with "504b0304" (PK..)
        if (!zipSignature.startsWith("504b0304")) {
          logger.error(`Invalid ZIP file signature: ${zipSignature}`);
          throw new Error(
            `Invalid ZIP file signature: ${zipSignature}. Expected ZIP file to start with '504b0304'`
          );
        }

        logger.info("ZIP file signature validation passed");

        // Create temporary extraction directory
        const tempDir = path.join(os.tmpdir(), `itracksy-update-${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });

        // Copy ZIP file to temp directory to avoid file locking issues
        const tempZipPath = path.join(tempDir, `update-${Date.now()}.zip`);
        logger.info(`Copying ZIP file to temp location: ${tempZipPath}`);

        try {
          // Verify file size again before copying
          const preCopyStats = fs.statSync(zipFilePath);
          logger.info(`Pre-copy file size: ${preCopyStats.size} bytes`);

          if (preCopyStats.size !== zipStats.size) {
            throw new Error(
              `File size changed during validation: original ${zipStats.size}, pre-copy ${preCopyStats.size}`
            );
          }

          fs.copyFileSync(zipFilePath, tempZipPath);
          const copiedStats = fs.statSync(tempZipPath);
          logger.info(`Copied ZIP file size: ${copiedStats.size} bytes`);

          if (copiedStats.size !== zipStats.size) {
            throw new Error(
              `File copy failed: original size ${zipStats.size}, copied size ${copiedStats.size}`
            );
          }

          logger.info("File copy completed successfully with size verification");
        } catch (copyError) {
          logger.error("Failed to copy ZIP file:", copyError);
          throw new Error(`Failed to copy ZIP file: ${copyError}`);
        }

        logger.info(`Extracting ZIP to: ${tempDir}`);

        // Extract ZIP file with better error handling
        try {
          logger.info(`Starting ZIP extraction from: ${tempZipPath}`);
          logger.info(`Extracting to directory: ${tempDir}`);
          logger.info(`ZIP file size before extraction: ${fs.statSync(tempZipPath).size} bytes`);

          // Check if temp directory exists and is writable
          if (!fs.existsSync(tempDir)) {
            logger.info(`Creating temp directory: ${tempDir}`);
            fs.mkdirSync(tempDir, { recursive: true });
          }

          // Check temp directory permissions
          try {
            fs.accessSync(tempDir, fs.constants.W_OK);
            logger.info("Temp directory is writable");
          } catch (permError) {
            logger.error("Temp directory is not writable:", permError);
            throw new Error(`Temp directory is not writable: ${permError}`);
          }

          // Log ZIP file details before extraction
          const zipStats = fs.statSync(tempZipPath);
          logger.info(
            `ZIP file stats: size=${zipStats.size}, mtime=${zipStats.mtime}, mode=${zipStats.mode}`
          );

          // Check if ZIP file is readable
          try {
            fs.accessSync(tempZipPath, fs.constants.R_OK);
            logger.info("ZIP file is readable");
          } catch (readError) {
            logger.error("ZIP file is not readable:", readError);
            throw new Error(`ZIP file is not readable: ${readError}`);
          }

          logger.info("Starting ZIP extraction with yauzl library...");

          // Extract ZIP file using yauzl (our robust extraction method)
          await extractZipWithYauzl(tempZipPath, tempDir);
          logger.info("ZIP extraction with yauzl completed successfully");

          // Verify extraction results
          const extractedFiles = fs.readdirSync(tempDir);
          logger.info(
            `Extracted ${extractedFiles.length} items to temp directory:`,
            extractedFiles
          );

          // Check if app.asar was extracted and its properties
          const appAsarPath = path.join(
            tempDir,
            "itracksy.app",
            "Contents",
            "Resources",
            "app.asar"
          );
          if (fs.existsSync(appAsarPath)) {
            const appAsarStats = fs.statSync(appAsarPath);
            logger.info(
              `app.asar extracted successfully: size=${appAsarStats.size} bytes, mode=${appAsarStats.mode}`
            );

            // Check if app.asar is readable
            try {
              fs.accessSync(appAsarPath, fs.constants.R_OK);
              logger.info("app.asar is readable");

              // Check the first few bytes to see if it's a valid ASAR file
              const fd = fs.openSync(appAsarPath, "r");
              const headerBuffer = Buffer.alloc(8);
              fs.readSync(fd, headerBuffer, 0, 8, 0);
              fs.closeSync(fd);

              const headerHex = headerBuffer.toString("hex");
              logger.info(`app.asar header (first 8 bytes): ${headerHex}`);

              // ASAR files should start with specific magic bytes
              if (headerHex.startsWith("04000000")) {
                logger.info("app.asar appears to have valid ASAR header");
              } else {
                logger.warn("app.asar does not appear to have valid ASAR header");
              }
            } catch (readError) {
              logger.error("app.asar is not readable:", readError);
            }
          } else {
            logger.error("app.asar not found after extraction");
          }
        } catch (extractError) {
          logger.error("ZIP extraction failed:", extractError);
          logger.error("Extract error details:", {
            message: extractError instanceof Error ? extractError.message : String(extractError),
            stack: extractError instanceof Error ? extractError.stack : undefined,
            originalZipFilePath: zipFilePath,
            tempZipPath,
            tempDir,
            originalZipFileSize: fs.existsSync(zipFilePath)
              ? fs.statSync(zipFilePath).size
              : "file not found",
            tempZipFileSize: fs.existsSync(tempZipPath)
              ? fs.statSync(tempZipPath).size
              : "file not found",
          });
          throw new Error(`Failed to extract ZIP file: ${extractError}`);
        }

        // Find the extracted app bundle
        const extractedFiles = fs.readdirSync(tempDir);
        const appBundle = extractedFiles.find(
          (file) => file.endsWith(".app") || file.endsWith(".exe") || file.endsWith("AppImage")
        );

        if (!appBundle) {
          throw new Error("No app bundle found in extracted files");
        }

        const extractedAppPath = path.join(tempDir, appBundle);
        const currentAppPath = process.execPath;

        logger.info(`Found app bundle: ${appBundle}`);
        logger.info(`Current app path: ${currentAppPath}`);

        // For macOS, we need to use a different approach due to code signing
        if (process.platform === "darwin") {
          logger.info("Platform detected: macOS - using script-based installation");

          // Instead of replacing the app bundle directly, we'll use a script approach
          // This is because signed app bundles can't be directly moved/replaced

          const currentAppDir = path.dirname(currentAppPath);
          const newAppPath = path.join(currentAppDir, appBundle);
          const updateScriptPath = path.join(tempDir, "update.sh");

          logger.info(`Current app directory: ${currentAppDir}`);
          logger.info(`New app path: ${newAppPath}`);
          logger.info(`Update script path: ${updateScriptPath}`);

          // Create an update script that will handle the replacement
          const updateScript = `#!/bin/bash
          echo "Starting update process..."
          echo "Current app path: ${newAppPath}"
          echo "Extracted app path: ${extractedAppPath}"
          echo "Temp directory: ${tempDir}"

          # Kill the current app
          echo "Killing current app process..."
          pkill -f "itracksy" || true
          sleep 2

          # Remove old app bundle
          echo "Removing old app bundle..."
          rm -rf "${newAppPath}"

          # Move new app bundle
          echo "Moving new app bundle..."
          mv "${extractedAppPath}" "${newAppPath}"

          # Launch the new app
          echo "Launching new app..."
          open "${newAppPath}"

          # Clean up
          echo "Cleaning up temporary files..."
          rm -rf "${tempDir}"

          echo "Update process completed successfully!"
          `;

          // Write the update script
          logger.info("Writing update script to disk...");
          fs.writeFileSync(updateScriptPath, updateScript);
          fs.chmodSync(updateScriptPath, 0o755);

          logger.info(`Created update script at: ${updateScriptPath}`);
          logger.info(`New app will be installed at: ${newAppPath}`);
          logger.info("Script contents:");
          logger.info(updateScript);

          // Execute the update script
          logger.info("Spawning update script process...");
          const { spawn } = require("child_process");
          const updateProcess = spawn("bash", [updateScriptPath], {
            detached: true,
            stdio: "pipe", // Changed to pipe to capture output
          });

          // Log script output for debugging
          updateProcess.stdout?.on("data", (data: Buffer) => {
            logger.info(`Update script stdout: ${data.toString()}`);
          });

          updateProcess.stderr?.on("data", (data: Buffer) => {
            logger.error(`Update script stderr: ${data.toString()}`);
          });

          updateProcess.on("close", (code: number | null) => {
            logger.info(`Update script process exited with code: ${code}`);
          });

          updateProcess.on("error", (error: Error) => {
            logger.error(`Update script process error: ${error}`);
          });

          updateProcess.unref();

          // Exit the current app so the update can proceed
          logger.info("Scheduling app quit in 1 second...");
          setTimeout(() => {
            logger.info("Quitting application to allow update...");
            app.quit();
          }, 1000);

          return {
            status: "success" as const,
            message: `Update to version ${version} is being installed. The application will restart automatically.`,
          };
        }

        // For other platforms (Windows, Linux), handle normally
        if (process.platform === "win32" || process.platform === "linux") {
          logger.info(`Platform detected: ${process.platform} - using direct file replacement`);

          const currentAppDir = path.dirname(currentAppPath);
          const newAppPath = path.join(currentAppDir, appBundle);

          logger.info(`Current app directory: ${currentAppDir}`);
          logger.info(`New app path: ${newAppPath}`);

          // Remove old app bundle if it exists
          if (fs.existsSync(newAppPath)) {
            logger.info("Removing existing app bundle...");
            fs.rmSync(newAppPath, { recursive: true, force: true });
          }

          // Move new app bundle to replace old one
          logger.info("Moving new app bundle to replace old one...");
          fs.renameSync(extractedAppPath, newAppPath);

          logger.info(`App bundle replaced at: ${newAppPath}`);

          // Clean up temporary directory
          logger.info("Cleaning up temporary directory...");
          fs.rmSync(tempDir, { recursive: true, force: true });

          // Clean up downloaded ZIP file
          logger.info("Cleaning up downloaded ZIP file...");
          fs.unlinkSync(zipFilePath);

          logger.info(`Update installation completed successfully`);

          return {
            status: "success" as const,
            message: `Update to version ${version} installed successfully. Please restart the application.`,
          };
        }
      } catch (error) {
        logger.error(`Failed to install update: ${error}`);

        // Get the download URL for manual download fallback
        const downloadUrl = getPlatformDownloadUrl(version);

        return {
          status: "error" as const,
          message: `Failed to install update: ${error}`,
          fallbackUrl: downloadUrl,
          fallbackMessage: "You can manually download the update from the releases page.",
        };
      }
    }),

  // Get database path
  getDatabasePath: publicProcedure.query(() => {
    const dbPath = getDatabasePath();
    // Remove 'file:' prefix to get actual file system path
    const actualPath = dbPath.replace(/^file:/, "");

    // Get absolute path
    const absolutePath = path.isAbsolute(actualPath)
      ? actualPath
      : path.resolve(process.cwd(), actualPath);

    return {
      path: absolutePath,
      directory: path.dirname(absolutePath),
      exists: fs.existsSync(absolutePath),
      size: fs.existsSync(absolutePath) ? fs.statSync(absolutePath).size : 0,
    };
  }),

  convertImageToDataUrl: publicProcedure
    .input(
      z.object({
        imagePath: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const { imagePath } = input;

        // Check if file exists - this is expected behavior for lazy-loaded thumbnails
        // so we don't log it as a warning to reduce log noise
        if (!fs.existsSync(imagePath)) {
          return null;
        }

        // Read the file as a buffer
        const imageBuffer = fs.readFileSync(imagePath);

        // Get the file extension to determine MIME type
        const ext = path.extname(imagePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".bmp": "image/bmp",
        };

        const mimeType = mimeTypes[ext] || "image/jpeg";

        // Convert to base64 data URL
        const base64Image = imageBuffer.toString("base64");
        const dataUrl = `data:${mimeType};base64,${base64Image}`;

        return dataUrl;
      } catch (error) {
        logger.error("Error converting image to data URL:", error);
        return null;
      }
    }),
});
