import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import defaultDb from "@/api/db";
import { translationCache, translationContexts, youtubeVideos } from "@yt-dlp-gui/database/schema";
import { desc, sql, eq } from "drizzle-orm";

/**
 * Translation router - handles translation cache and learning features
 */
export const translationRouter = t.router({
  /**
   * Get all translations, sorted by most recent or most queried
   */
  getTranslations: publicProcedure
    .input(
      z.object({
        limit: z.number().optional().default(100),
        offset: z.number().optional().default(0),
        sortBy: z.enum(["recent", "frequent"]).optional().default("recent"),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db ?? defaultDb;

      try {
        const orderColumn = input.sortBy === "frequent"
          ? desc(translationCache.queryCount)
          : desc(translationCache.lastQueriedAt);

        const translations = await db
          .select()
          .from(translationCache)
          .orderBy(orderColumn)
          .limit(input.limit)
          .offset(input.offset);

        // Get total count for pagination
        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(translationCache);

        const total = countResult?.count ?? 0;

        logger.debug("[translation] getTranslations", {
          count: translations.length,
          total,
          sortBy: input.sortBy,
        });

        return {
          translations,
          total,
          hasMore: input.offset + translations.length < total,
        };
      } catch (error) {
        logger.error("[translation] getTranslations failed", error as Error);
        throw error;
      }
    }),

  /**
   * Get translation statistics
   */
  getStatistics: publicProcedure.query(async ({ ctx }) => {
    const db = ctx.db ?? defaultDb;

    try {
      // Total translations count
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(translationCache);

      const totalTranslations = totalResult?.count ?? 0;

      // Total queries count
      const [queriesResult] = await db
        .select({ total: sql<number>`sum(query_count)` })
        .from(translationCache);

      const totalQueries = queriesResult?.total ?? 0;

      // Most frequent translation
      const mostFrequent = await db
        .select()
        .from(translationCache)
        .orderBy(desc(translationCache.queryCount))
        .limit(1);

      // Count unique language pairs
      const [languagePairsResult] = await db
        .select({
          count: sql<number>`count(distinct source_lang || '->' || target_lang)`
        })
        .from(translationCache);

      const uniqueLanguagePairs = languagePairsResult?.count ?? 0;

      logger.debug("[translation] getStatistics", {
        totalTranslations,
        totalQueries,
        uniqueLanguagePairs,
      });

      return {
        totalTranslations,
        totalQueries,
        uniqueLanguagePairs,
        mostFrequent: mostFrequent[0] || null,
      };
    } catch (error) {
      logger.error("[translation] getStatistics failed", error as Error);
      throw error;
    }
  }),

  /**
   * Search translations by text
   */
  searchTranslations: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().optional().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db ?? defaultDb;

      try {
        const searchPattern = `%${input.query.toLowerCase()}%`;

        const results = await db
          .select()
          .from(translationCache)
          .where(
            sql`lower(${translationCache.sourceText}) like ${searchPattern}
                or lower(${translationCache.translatedText}) like ${searchPattern}`
          )
          .orderBy(desc(translationCache.queryCount))
          .limit(input.limit);

        logger.debug("[translation] searchTranslations", {
          query: input.query,
          count: results.length,
        });

        return results;
      } catch (error) {
        logger.error("[translation] searchTranslations failed", error as Error);
        throw error;
      }
    }),

  /**
   * Delete a translation from cache
   */
  deleteTranslation: publicProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db ?? defaultDb;

      try {
        await db
          .delete(translationCache)
          .where(sql`${translationCache.id} = ${input.id}`);

        logger.info("[translation] Deleted translation", { id: input.id });

        return { success: true };
      } catch (error) {
        logger.error("[translation] deleteTranslation failed", error as Error);
        throw error;
      }
    }),

  /**
   * Get video contexts for a specific translation
   * Returns all videos and timestamps where this word/phrase was translated
   */
  getTranslationContexts: publicProcedure
    .input(
      z.object({
        translationId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db ?? defaultDb;

      try {
        // Fetch contexts with video metadata
        const contexts = await db
          .select({
            id: translationContexts.id,
            translationId: translationContexts.translationId,
            videoId: translationContexts.videoId,
            timestampSeconds: translationContexts.timestampSeconds,
            contextText: translationContexts.contextText,
            createdAt: translationContexts.createdAt,
            // Video metadata
            videoTitle: youtubeVideos.title,
            videoThumbnailUrl: youtubeVideos.thumbnailUrl,
            videoThumbnailPath: youtubeVideos.thumbnailPath,
            videoDuration: youtubeVideos.durationSeconds,
          })
          .from(translationContexts)
          .leftJoin(youtubeVideos, eq(translationContexts.videoId, youtubeVideos.videoId))
          .where(eq(translationContexts.translationId, input.translationId))
          .orderBy(desc(translationContexts.createdAt));

        logger.debug("[translation] getTranslationContexts", {
          translationId: input.translationId,
          count: contexts.length,
        });

        return contexts;
      } catch (error) {
        logger.error("[translation] getTranslationContexts failed", error as Error);
        throw error;
      }
    }),

  /**
   * Get all translations for a specific video (for inline display)
   * Returns translations with their source text for matching against transcript
   */
  getByVideoId: publicProcedure
    .input(
      z.object({
        videoId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db ?? defaultDb;

      try {
        // Fetch all translations for this video via contexts
        const videoTranslations = await db
          .select({
            id: translationCache.id,
            sourceText: translationCache.sourceText,
            translatedText: translationCache.translatedText,
            sourceLang: translationCache.sourceLang,
            targetLang: translationCache.targetLang,
            detectedLang: translationCache.detectedLang,
            queryCount: translationCache.queryCount,
            timestampSeconds: translationContexts.timestampSeconds,
          })
          .from(translationContexts)
          .innerJoin(translationCache, eq(translationContexts.translationId, translationCache.id))
          .where(eq(translationContexts.videoId, input.videoId))
          .orderBy(desc(translationCache.queryCount)); // Most frequent first for better matching

        logger.debug("[translation] getByVideoId", {
          videoId: input.videoId,
          count: videoTranslations.length,
        });

        return videoTranslations;
      } catch (error) {
        logger.error("[translation] getByVideoId failed", error as Error);
        throw error;
      }
    }),
});

export type TranslationRouter = typeof translationRouter;

