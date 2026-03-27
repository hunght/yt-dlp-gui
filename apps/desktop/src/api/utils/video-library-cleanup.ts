import fs from "fs";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "@/api/db";
import {
  customPlaylistItems,
  favorites,
  flashcards,
  generatedQuizzes,
  playlistItems,
  quizResults,
  translationContexts,
  videoAnnotations,
  videoSummaries,
  videoTranscripts,
  videoWatchStats,
  youtubeVideos,
} from "@/api/db/schema";
import { logger } from "@/helpers/logger";

const SQLITE_BATCH_SIZE = 200;

const isNodeError = (value: unknown): value is NodeJS.ErrnoException => {
  return typeof value === "object" && value !== null && "code" in value;
};

const chunkArray = <T>(items: T[], size = SQLITE_BATCH_SIZE): T[][] => {
  if (items.length === 0) return [];

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] => {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))];
};

const removeFileIfExists = async (filePath: string): Promise<void> => {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    logger.warn("[video-library-cleanup] Failed to delete file", {
      filePath,
      error: String(error),
    });
  }
};

export async function findReferencedVideoIds(
  db: Database,
  videoIds: string[],
  options?: { excludeCustomPlaylistId?: string }
): Promise<Set<string>> {
  const referencedIds = new Set<string>();
  const uniqueVideoIds = uniqueStrings(videoIds);

  for (const chunk of chunkArray(uniqueVideoIds)) {
    const customPlaylistWhere = options?.excludeCustomPlaylistId
      ? and(
          inArray(customPlaylistItems.videoId, chunk),
          ne(customPlaylistItems.playlistId, options.excludeCustomPlaylistId)
        )
      : inArray(customPlaylistItems.videoId, chunk);

    const [otherCustomPlaylistRows, channelPlaylistRows, favoritedVideoRows] = await Promise.all([
      db
        .select({ videoId: customPlaylistItems.videoId })
        .from(customPlaylistItems)
        .where(customPlaylistWhere),
      db
        .select({ videoId: playlistItems.videoId })
        .from(playlistItems)
        .where(inArray(playlistItems.videoId, chunk)),
      db
        .select({ videoId: favorites.entityId })
        .from(favorites)
        .where(and(eq(favorites.entityType, "video"), inArray(favorites.entityId, chunk))),
    ]);

    for (const row of otherCustomPlaylistRows) referencedIds.add(row.videoId);
    for (const row of channelPlaylistRows) referencedIds.add(row.videoId);
    for (const row of favoritedVideoRows) referencedIds.add(row.videoId);
  }

  return referencedIds;
}

export async function deleteVideoLibraryData(
  db: Database,
  videoIds: string[]
): Promise<{ deletedVideoIds: string[]; deletedFileCount: number }> {
  const uniqueVideoIds = uniqueStrings(videoIds);
  if (uniqueVideoIds.length === 0) {
    return { deletedVideoIds: [], deletedFileCount: 0 };
  }

  const removableFilePaths: Array<string | null | undefined> = [];

  for (const chunk of chunkArray(uniqueVideoIds)) {
    const [videoRows, flashcardRows] = await Promise.all([
      db
        .select({
          videoId: youtubeVideos.videoId,
          thumbnailPath: youtubeVideos.thumbnailPath,
          downloadFilePath: youtubeVideos.downloadFilePath,
        })
        .from(youtubeVideos)
        .where(inArray(youtubeVideos.videoId, chunk)),
      db
        .select({
          screenshotPath: flashcards.screenshotPath,
        })
        .from(flashcards)
        .where(inArray(flashcards.videoId, chunk)),
    ]);

    removableFilePaths.push(
      ...videoRows.flatMap((row) => [row.thumbnailPath, row.downloadFilePath]),
      ...flashcardRows.map((row) => row.screenshotPath)
    );
  }

  const uniqueFilePaths = uniqueStrings(removableFilePaths);
  await Promise.all(uniqueFilePaths.map((filePath) => removeFileIfExists(filePath)));

  for (const chunk of chunkArray(uniqueVideoIds)) {
    await db
      .delete(favorites)
      .where(and(eq(favorites.entityType, "video"), inArray(favorites.entityId, chunk)));
    await db.delete(translationContexts).where(inArray(translationContexts.videoId, chunk));
    await db.delete(videoSummaries).where(inArray(videoSummaries.videoId, chunk));
    await db.delete(generatedQuizzes).where(inArray(generatedQuizzes.videoId, chunk));
    await db.delete(quizResults).where(inArray(quizResults.videoId, chunk));
    await db.delete(flashcards).where(inArray(flashcards.videoId, chunk));
    await db.delete(videoAnnotations).where(inArray(videoAnnotations.videoId, chunk));
    await db.delete(videoTranscripts).where(inArray(videoTranscripts.videoId, chunk));
    await db.delete(videoWatchStats).where(inArray(videoWatchStats.videoId, chunk));
    await db.delete(youtubeVideos).where(inArray(youtubeVideos.videoId, chunk));
  }

  logger.info("[video-library-cleanup] Deleted video library data", {
    videoCount: uniqueVideoIds.length,
    fileCount: uniqueFilePaths.length,
  });

  return {
    deletedVideoIds: uniqueVideoIds,
    deletedFileCount: uniqueFilePaths.length,
  };
}
