#!/usr/bin/env tsx
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { desc, eq, sql } from "drizzle-orm";
import * as schema from "@yt-dlp-gui/database/schema";
import fs from "fs";
import path from "path";

async function main() {
  // Prefer DATABASE_URL if provided; otherwise default to local file in repo root
  const dbUrl = process.env.DATABASE_URL ?? "file:local.db";
  const actualPath = dbUrl.replace(/^file:/, "");
  const absolutePath = path.isAbsolute(actualPath)
    ? actualPath
    : path.resolve(process.cwd(), actualPath);

  const client = createClient({ url: dbUrl, authToken: "" });
  const db = drizzle(client, { schema });

  try {
    await db.run(sql`PRAGMA wal_checkpoint(FULL)`);
  } catch {}

  const totals = await db
    .select({
      total: sql<number>`count(*)`,
    })
    .from(schema.youtubeVideos);

  const completed = await db
    .select({
      total: sql<number>`count(*)`,
    })
    .from(schema.youtubeVideos)
    .where(eq(schema.youtubeVideos.downloadStatus, "completed" as any));

  const recent = await db
    .select({
      id: schema.youtubeVideos.id,
      videoId: schema.youtubeVideos.videoId,
      title: schema.youtubeVideos.title,
      status: schema.youtubeVideos.downloadStatus,
      lastDownloadedAt: schema.youtubeVideos.lastDownloadedAt,
      filePath: schema.youtubeVideos.downloadFilePath,
    })
    .from(schema.youtubeVideos)
    .where(eq(schema.youtubeVideos.downloadStatus, "completed" as any))
    .orderBy(desc(schema.youtubeVideos.lastDownloadedAt))
    .limit(5);

  console.log("DB Counts:");
  console.log("==========");
  console.log("Path:", absolutePath);
  console.log("Exists:", fs.existsSync(absolutePath));
  console.log(
    "Size:",
    fs.existsSync(absolutePath) ? fs.statSync(absolutePath).size + " bytes" : "(missing)"
  );
  console.log("Total videos:", totals[0]?.total ?? 0);
  console.log("Completed:", completed[0]?.total ?? 0);
  console.log("Recent completed (top 5):\n", recent);

  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
