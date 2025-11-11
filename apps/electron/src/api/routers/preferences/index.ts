import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { app } from "electron";
import { eq } from "drizzle-orm";
import { userPreferences } from "@/api/db/schema";
import defaultDb, { type Database } from "@/api/db";

// Zod schema for preferred languages JSON
const languagesArraySchema = z.array(z.string());

// Get system language from Electron
const getSystemLanguage = (): string => {
  try {
    const locale = app.getLocale(); // e.g., "en-US", "es-ES", "fr-FR"
    // Extract primary language code (first 2 chars)
    const lang = locale.split("-")[0].toLowerCase();
    return lang || "en";
  } catch (e) {
    logger.warn("[preferences] Failed to get system language", { error: String(e) });
    return "en";
  }
};

// Initialize user preferences with system language if not exists
const ensurePreferencesExist = async (db: Database): Promise<void> => {
  try {
    const existing = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.id, "default"))
      .limit(1);

    if (existing.length === 0) {
      const systemLang = getSystemLanguage();
      const now = Date.now();
      await db.insert(userPreferences).values({
        id: "default",
        preferredLanguages: JSON.stringify([systemLang]),
        systemLanguage: systemLang,
        createdAt: now,
        updatedAt: now,
      });
      logger.info("[preferences] Initialized with system language", { systemLang });
    } else if (!existing[0].systemLanguage) {
      // Backfill systemLanguage if missing
      const systemLang = getSystemLanguage();
      await db
        .update(userPreferences)
        .set({ systemLanguage: systemLang, updatedAt: Date.now() })
        .where(eq(userPreferences.id, "default"));
      logger.info("[preferences] Backfilled system language", { systemLang });
    }
  } catch (e) {
    logger.error("[preferences] Failed to ensure preferences exist", e);
  }
};

export const preferencesRouter = t.router({
  // Get user preferences (auto-initialize if missing)
  getUserPreferences: publicProcedure.query(async ({ ctx }) => {
    const db = ctx.db ?? defaultDb;
    await ensurePreferencesExist(db);

    try {
      const rows = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.id, "default"))
        .limit(1);

      if (rows.length === 0) {
        // Fallback: return default with system language
        const systemLang = getSystemLanguage();
        return {
          id: "default",
          preferredLanguages: [systemLang],
          systemLanguage: systemLang,
          createdAt: Date.now(),
          updatedAt: null,
        } as const;
      }

      const row = rows[0];
      const langsResult = languagesArraySchema.safeParse(
        JSON.parse(row.preferredLanguages || "[]")
      );
      return {
        id: row.id,
        preferredLanguages: langsResult.success ? langsResult.data : [],
        systemLanguage: row.systemLanguage ?? getSystemLanguage(),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } as const;
    } catch (e) {
      logger.error("[preferences] getUserPreferences failed", e);
      const systemLang = getSystemLanguage();
      return {
        id: "default",
        preferredLanguages: [systemLang],
        systemLanguage: systemLang,
        createdAt: Date.now(),
        updatedAt: null,
      } as const;
    }
  }),

  // Update preferred languages list
  updatePreferredLanguages: publicProcedure
    .input(z.object({ languages: z.array(z.string()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      await ensurePreferencesExist(db);

      try {
        const now = Date.now();
        const json = JSON.stringify(input.languages);
        await db
          .update(userPreferences)
          .set({ preferredLanguages: json, updatedAt: now })
          .where(eq(userPreferences.id, "default"));

        logger.info("[preferences] Updated preferred languages", { languages: input.languages });
        return { success: true as const, languages: input.languages };
      } catch (e) {
        logger.error("[preferences] updatePreferredLanguages failed", e);
        return { success: false as const, message: String(e) };
      }
    }),

  // Get system language (utility)
  getSystemLanguage: publicProcedure.query(() => {
    return { language: getSystemLanguage() } as const;
  }),
});

// Router type not exported (unused)
