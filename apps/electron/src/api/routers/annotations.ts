import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { eq } from "drizzle-orm";
import { videoAnnotations } from "@/api/db/schema";
import defaultDb from "@/api/db";

// Infer VideoAnnotation type from Drizzle schema
type VideoAnnotation = typeof videoAnnotations.$inferSelect;

// Return types for annotations router
type CreateAnnotationSuccess = {
  success: true;
  id: string;
  createdAt: number;
};

type CreateAnnotationFailure = {
  success: false;
  message: string;
};

type CreateAnnotationResult = CreateAnnotationSuccess | CreateAnnotationFailure;

type ListAnnotationsResult = VideoAnnotation[];

type UpdateAnnotationSuccess = {
  success: true;
};

type UpdateAnnotationFailure = {
  success: false;
  message: string;
};

type UpdateAnnotationResult = UpdateAnnotationSuccess | UpdateAnnotationFailure;

type DeleteAnnotationSuccess = {
  success: true;
};

type DeleteAnnotationFailure = {
  success: false;
  message: string;
};

type DeleteAnnotationResult = DeleteAnnotationSuccess | DeleteAnnotationFailure;

export const annotationsRouter = t.router({
  // Create a new annotation/comment on a video at a specific timestamp
  create: publicProcedure
    .input(
      z
        .object({
          videoId: z.string(),
          timestampSeconds: z.number().min(0),
          selectedText: z.string().optional(),
          note: z.string().optional(), // Allow empty notes when using emoji only
          emoji: z.string().optional(),
        })
        .refine((data) => (data.note && data.note.length > 0) || data.emoji, {
          message: "Either note or emoji must be provided",
          path: ["note"],
        })
    )
    .mutation(async ({ input, ctx }): Promise<CreateAnnotationResult> => {
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
        return { success: true, id, createdAt: now };
      } catch (e) {
        logger.error("[annotations] create failed", e);
        return { success: false, message: String(e) };
      }
    }),

  // Get all annotations for a video, sorted by timestamp
  list: publicProcedure.input(z.object({ videoId: z.string() })).query(async ({ input, ctx }): Promise<ListAnnotationsResult> => {
    const db = ctx.db ?? defaultDb;
    try {
      const rows = await db
        .select()
        .from(videoAnnotations)
        .where(eq(videoAnnotations.videoId, input.videoId))
        .orderBy(videoAnnotations.timestampSeconds);
      return rows;
    } catch (e) {
      logger.error("[annotations] list failed", e);
      return [];
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
    .mutation(async ({ input, ctx }): Promise<UpdateAnnotationResult> => {
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
        return { success: true };
      } catch (e) {
        logger.error("[annotations] update failed", e);
        return { success: false, message: String(e) };
      }
    }),

  // Delete an annotation
  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }): Promise<DeleteAnnotationResult> => {
    const db = ctx.db ?? defaultDb;
    try {
      await db.delete(videoAnnotations).where(eq(videoAnnotations.id, input.id));
      return { success: true };
    } catch (e) {
      logger.error("[annotations] delete failed", e);
      return { success: false, message: String(e) };
    }
  }),
});
