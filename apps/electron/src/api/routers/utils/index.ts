import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { shell, net, app } from "electron";
import {
  createNotificationWindow,
  closeNotificationWindow as closeWindow,
} from "@/main/windows/notification";
import { sendNotificationToWindow } from "@/helpers/notification/notification-window-utils";

import { logger } from "@/helpers/logger";
import path from "path";
import fs from "fs";
import os from "os";
import { extractZipWithYauzl } from "./service";
import { getDatabasePath } from "@/utils/paths";
import { translationCache, translationContexts } from "@yt-dlp-gui/database";
import crypto from "crypto";

// Zod schemas for dictionary API response
const dictionaryDefinitionSchema = z.object({
  definition: z.string(),
  example: z.string().optional(),
});

const dictionaryMeaningSchema = z.object({
  partOfSpeech: z.string().optional(),
  definitions: z.array(dictionaryDefinitionSchema).optional(),
});

const dictionaryPhoneticSchema = z.object({
  text: z.string().optional(),
});

const dictionaryEntrySchema = z.object({
  meanings: z.array(dictionaryMeaningSchema).optional(),
  phonetic: z.string().optional(),
  phonetics: z.array(dictionaryPhoneticSchema).optional(),
});

const dictionaryResponseSchema = z.union([z.array(dictionaryEntrySchema), dictionaryEntrySchema]);

// Zod schema for Google Translate API response
// Format: [[[translatedText, originalText, null, null, translatedWordCount]], ...otherData, detectedLang]
// Note: Response structure varies, so we use a flexible schema
const googleTranslateResponseSchema = z.array(z.unknown());

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
        const cleanWord = input.word
          .split(/\s+/)[0]
          .replace(/[.,!?;:()[\]'"\-–—]/g, "")
          .toLowerCase();
        const langCode = input.language ? input.language.split("-")[0] : "en";

        // For now, use a simple approach: call a free dictionary API and enhance with a fun explanation
        // You can replace this with OpenAI/Anthropic API later
        const dictionaryApiUrl = `https://api.dictionaryapi.dev/api/v2/entries/${langCode}/${encodeURIComponent(cleanWord)}`;

        try {
          const response = await fetch(dictionaryApiUrl);
          if (response.ok) {
            const rawData: unknown = await response.json();
            const parseResult = dictionaryResponseSchema.safeParse(rawData);

            if (parseResult.success) {
              const data = parseResult.data;
              const firstEntry = Array.isArray(data) ? data[0] : data;

              // Extract definition and example
              const meanings = firstEntry.meanings ?? [];
              const firstMeaning = meanings[0];
              const definition = firstMeaning?.definitions?.[0]?.definition ?? "";
              const example = firstMeaning?.definitions?.[0]?.example ?? "";
              const partOfSpeech = firstMeaning?.partOfSpeech ?? "";

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
                pronunciation: firstEntry.phonetic ?? firstEntry.phonetics?.[0]?.text ?? "",
              };
            }
          }
        } catch (e) {
          logger.debug("[word-explanation] Dictionary API failed, will open ChatGPT", {
            word: cleanWord,
            error: String(e),
          });
        }

        // Fallback: Return flag to open ChatGPT with word query
        return {
          success: false as const,
          shouldOpenChatGPT: true as const,
          word: cleanWord,
          language: langCode,
        };
      } catch (e) {
        logger.error("[word-explanation] Failed to explain word", {
          word: input.word,
          error: String(e),
        });
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

                await db
                  .insert(translationContexts)
                  .values({
                    id: crypto.randomUUID(),
                    translationId: cachedEntry.id,
                    videoId: input.videoId,
                    timestampSeconds: Math.floor(input.timestampSeconds),
                    contextText: input.contextText || null,
                    createdAt: now,
                  })
                  .onConflictDoNothing(); // Ignore if duplicate

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

        const rawData: unknown = await response.json();
        const parseResult = googleTranslateResponseSchema.safeParse(rawData);

        if (
          !parseResult.success ||
          !Array.isArray(parseResult.data) ||
          !Array.isArray(parseResult.data[0])
        ) {
          logger.error("[translation] Invalid API response structure", { rawData });
          throw new Error("Invalid translation API response structure");
        }

        const data = parseResult.data;

        // Safely extract translations from nested structure
        const firstElement = data[0];
        if (!Array.isArray(firstElement)) {
          throw new Error("Translation data format unexpected");
        }

        const translatedText = firstElement
          .filter(
            (item: unknown): item is unknown[] => Array.isArray(item) && typeof item[0] === "string"
          )
          .map((item: unknown[]) => String(item[0]))
          .join("");

        // Detect source language (data[2] contains detected language)
        const detectedLang = typeof data[2] === "string" ? data[2] : sl;

        // Store in cache for future use
        if (db) {
          try {
            const cacheId = crypto.randomUUID();
            const now = Date.now();
            const { sql } = await import("drizzle-orm");

            // Use upsert: insert or update if already exists, return the record
            const [upsertedRecord] = await db
              .insert(translationCache)
              .values({
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
              })
              .onConflictDoUpdate({
                target: [
                  translationCache.sourceText,
                  translationCache.sourceLang,
                  translationCache.targetLang,
                ],
                set: {
                  queryCount: sql`${translationCache.queryCount} + 1`,
                  lastQueriedAt: now,
                  updatedAt: now,
                },
              })
              .returning();

            const actualCacheId = upsertedRecord.id;

            logger.debug("[translation] Cached translation", {
              sourceText: cleanText,
              sourceLang: sl,
              targetLang: tl,
              queryCount: upsertedRecord.queryCount,
            });

            // Save video context
            try {
              await db
                .insert(translationContexts)
                .values({
                  id: crypto.randomUUID(),
                  translationId: actualCacheId,
                  videoId: input.videoId,
                  timestampSeconds: Math.floor(input.timestampSeconds),
                  contextText: input.contextText ?? null,
                  createdAt: now,
                })
                .onConflictDoNothing();

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
          translationId: "", // No ID if caching failed
          originalText: cleanText,
          sourceLang: detectedLang,
          targetLang: tl,
          fromCache: false,
        };
      } catch (e) {
        logger.error("[translation] Failed to translate text", {
          text: input.text,
          error: String(e),
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
      return await logger.getFileContent();
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
        logger.error("Failed to open notification window", error);
        return { success: false, error: String(error) };
      }
    }),

  // Version checking procedure
  checkForUpdates: publicProcedure.query(async () => {
    return { status: "success", currentVersion: "1.0.001" };
    // try {
    //   logger.info("Checking for updates...");
    //   const currentVersion = app.getVersion();
    //   logger.info(`Current app version: ${currentVersion}`);

    //   // Fetch the latest release from GitHub
    //   const response = await fetch(
    //     "https://api.github.com/repos/your-org/yt-dlp-gui/releases/latest"
    //   );

    //   if (!response.ok) {
    //     logger.error(`Failed to fetch latest release: ${response.statusText}`);
    //     return {
    //       status: "error" as const,
    //       message: "Failed to check for updates. Please try again later.",
    //       hasUpdate: false,
    //     };
    //   }

    //   const release = await response.json();
    //   const latestVersion = release.tag_name.replace("v", "");
    //   const downloadUrl = getPlatformDownloadUrl(latestVersion);

    //   logger.info(`Latest version available: ${latestVersion}`);

    //   // Compare versions (simple string comparison, assuming semver format)
    //   const hasUpdate = latestVersion > currentVersion;

    //   return {
    //     status: "success" as const,
    //     message: hasUpdate
    //       ? `Update available: ${latestVersion}`
    //       : "You are using the latest version.",
    //     hasUpdate,
    //     currentVersion,
    //     latestVersion,
    //     downloadUrl,
    //   };
    // } catch (error) {
    //   logger.error("Failed to check for updates", error);
    //   return {
    //     status: "error" as const,
    //     message: "Failed to check for updates. Please try again later.",
    //     hasUpdate: false,
    //   };
    // }
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
        }>((resolve, reject) => {
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
      logger.error("Failed to close notification window", error);
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
        logger.error("Failed to send notification", error);
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
      try {
        const { zipFilePath, version } = input;
        await extractZipWithYauzl(zipFilePath, version);
        return {
          status: "success",
          message: "Update installed successfully",
          fallbackUrl: null,
          downloadUrl: null,
        };
      } catch (error) {
        logger.error("Failed to install update", error);
        return { status: "error" as const, message: "Failed to install update" };
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
        return `data:${mimeType};base64,${base64Image}`;
      } catch (error) {
        logger.error("Error converting image to data URL:", error);
        return null;
      }
    }),
});
