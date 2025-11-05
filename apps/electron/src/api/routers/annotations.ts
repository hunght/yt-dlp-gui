import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { eq } from "drizzle-orm";
import { videoAnnotations } from "@/api/db/schema";
import defaultDb from "@/api/db";

export const annotationsRouter = t.router({
  // Create a new annotation/comment on a video at a specific timestamp
  create: publicProcedure
    .input(
      z.object({
        videoId: z.string(),
        timestampSeconds: z.number().min(0),
        selectedText: z.string().optional(),
        note: z.string().optional(), // Allow empty notes when using emoji only
        emoji: z.string().optional(),
      })
      .refine(
        (data) => (data.note && data.note.length > 0) || data.emoji,
        {
          message: "Either note or emoji must be provided",
          path: ["note"],
        }
      )
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const now = Date.now();
      try {
        const id = crypto.randomUUID();
        await db.insert(videoAnnotations).values({
          id,
          videoId: input.videoId,
          timestampSeconds: Math.floor(input.timestampSeconds),
          selectedText: input.selectedText ?? null,
          note: input.note || "", // Use empty string if no note provided
          emoji: input.emoji ?? null,
          createdAt: now,
          updatedAt: now,
        });
        return { success: true as const, id, createdAt: now } as const;
      } catch (e) {
        logger.error("[annotations] create failed", e as Error);
        return { success: false as const, message: String(e) } as const;
      }
    }),

  // Get all annotations for a video, sorted by timestamp
  list: publicProcedure
    .input(z.object({ videoId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      try {
        const rows = await db
          .select()
          .from(videoAnnotations)
          .where(eq(videoAnnotations.videoId, input.videoId))
          .orderBy(videoAnnotations.timestampSeconds);
        return rows;
      } catch (e) {
        logger.error("[annotations] list failed", e as Error);
        return [] as any[];
      }
    }),

  // Update an annotation
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        note: z.string().min(1),
        selectedText: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const now = Date.now();
      try {
        await db
          .update(videoAnnotations)
          .set({
            note: input.note,
            selectedText: input.selectedText ?? null,
            updatedAt: now,
          })
          .where(eq(videoAnnotations.id, input.id));
        return { success: true as const } as const;
      } catch (e) {
        logger.error("[annotations] update failed", e as Error);
        return { success: false as const, message: String(e) } as const;
      }
    }),

  // Delete an annotation
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      try {
        await db.delete(videoAnnotations).where(eq(videoAnnotations.id, input.id));
        return { success: true as const } as const;
      } catch (e) {
        logger.error("[annotations] delete failed", e as Error);
        return { success: false as const, message: String(e) } as const;
      }
    }),
});

export type AnnotationsRouter = typeof annotationsRouter;


