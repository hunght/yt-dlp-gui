import { z } from "zod";
import { publicProcedure, t } from "../trpc";
import { eq, desc, asc, like, and, or, sql } from "drizzle-orm";
import { youtubeVideos } from "../db/schema";
import db from "../db";
import { logger } from "../../helpers/logger";

export const youtubeRouter = t.router({
  // Get all videos with pagination and optional filtering
  getVideos: publicProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        channelId: z.string().optional(),
        sortBy: z
          .enum(["createdAt", "publishedAt", "title", "viewCount", "likeCount"])
          .default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ input }) => {
      try {
        const { page, limit, search, channelId, sortBy, sortOrder } = input;
        const offset = (page - 1) * limit;

        // Build where conditions
        const whereConditions = [];

        if (search) {
          whereConditions.push(
            or(
              like(youtubeVideos.title, `%${search}%`),
              like(youtubeVideos.description, `%${search}%`),
              like(youtubeVideos.channelTitle, `%${search}%`)
            )
          );
        }

        if (channelId) {
          whereConditions.push(eq(youtubeVideos.channelId, channelId));
        }

        const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

        // Build order by clause
        let orderByClause;
        switch (sortBy) {
          case "createdAt":
            orderByClause =
              sortOrder === "asc" ? asc(youtubeVideos.createdAt) : desc(youtubeVideos.createdAt);
            break;
          case "publishedAt":
            orderByClause =
              sortOrder === "asc"
                ? asc(youtubeVideos.publishedAt)
                : desc(youtubeVideos.publishedAt);
            break;
          case "title":
            orderByClause =
              sortOrder === "asc" ? asc(youtubeVideos.title) : desc(youtubeVideos.title);
            break;
          case "viewCount":
            orderByClause =
              sortOrder === "asc" ? asc(youtubeVideos.viewCount) : desc(youtubeVideos.viewCount);
            break;
          case "likeCount":
            orderByClause =
              sortOrder === "asc" ? asc(youtubeVideos.likeCount) : desc(youtubeVideos.likeCount);
            break;
          default:
            orderByClause = desc(youtubeVideos.createdAt);
        }

        // Get total count for pagination
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(youtubeVideos)
          .where(whereClause);

        const totalCount = countResult[0]?.count || 0;

        // Get videos
        const videos = await db
          .select()
          .from(youtubeVideos)
          .where(whereClause)
          .orderBy(orderByClause)
          .limit(limit)
          .offset(offset);

        return {
          videos,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            hasNextPage: page < Math.ceil(totalCount / limit),
            hasPrevPage: page > 1,
          },
        };
      } catch (error) {
        logger.error("Failed to fetch videos:", error);
        throw error;
      }
    }),

  // Get a single video by ID
  getVideoById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    try {
      const video = await db
        .select()
        .from(youtubeVideos)
        .where(eq(youtubeVideos.id, input.id))
        .limit(1);

      return video[0] || null;
    } catch (error) {
      logger.error("Failed to fetch video by ID:", error);
      throw error;
    }
  }),

  // Get videos by channel ID
  getVideosByChannel: publicProcedure
    .input(
      z.object({
        channelId: z.string(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      try {
        const videos = await db
          .select()
          .from(youtubeVideos)
          .where(eq(youtubeVideos.channelId, input.channelId))
          .orderBy(desc(youtubeVideos.publishedAt))
          .limit(input.limit);

        return videos;
      } catch (error) {
        logger.error("Failed to fetch videos by channel:", error);
        throw error;
      }
    }),

  // Get video statistics
  getVideoStats: publicProcedure.query(async () => {
    try {
      const stats = await db
        .select({
          totalVideos: sql<number>`count(*)`,
          totalViews: sql<number>`sum(${youtubeVideos.viewCount})`,
          totalLikes: sql<number>`sum(${youtubeVideos.likeCount})`,
          totalDuration: sql<number>`sum(${youtubeVideos.durationSeconds})`,
          uniqueChannels: sql<number>`count(distinct ${youtubeVideos.channelId})`,
        })
        .from(youtubeVideos);

      return (
        stats[0] || {
          totalVideos: 0,
          totalViews: 0,
          totalLikes: 0,
          totalDuration: 0,
          uniqueChannels: 0,
        }
      );
    } catch (error) {
      logger.error("Failed to fetch video statistics:", error);
      throw error;
    }
  }),

  // Get unique channels
  getChannels: publicProcedure.query(async () => {
    try {
      const channels = await db
        .select({
          channelId: youtubeVideos.channelId,
          channelTitle: youtubeVideos.channelTitle,
          videoCount: sql<number>`count(*)`,
        })
        .from(youtubeVideos)
        .groupBy(youtubeVideos.channelId, youtubeVideos.channelTitle)
        .orderBy(desc(sql`count(*)`));

      return channels;
    } catch (error) {
      logger.error("Failed to fetch channels:", error);
      throw error;
    }
  }),
});
