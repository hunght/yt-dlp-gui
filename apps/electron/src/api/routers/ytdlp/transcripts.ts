import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { app } from "electron";
import fs from "fs";
import path from "path";
import { eq, sql } from "drizzle-orm";
import { videoTranscripts, youtubeVideos } from "@/api/db/schema";
import defaultDb from "@/api/db";
import { spawnYtDlpWithLogging } from "./utils/ytdlp";

const getTranscriptsDir = () => path.join(app.getPath("userData"), "cache", "transcripts");

function ensureDirSync(p: string) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

/**
 * Normalize language code to base 2-letter code
 * Examples: "en-orig" -> "en", "en-us" -> "en", "vi" -> "vi"
 */
function normalizeLangCode(lang: string | null | undefined): string {
  if (!lang) return "en";
  // Extract first 2 letters (base language code)
  const normalized = lang.toLowerCase().split(/[-_]/)[0].substring(0, 2);
  return normalized || "en";
}

// Helper function to decode HTML entities in transcript text
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&nbsp;': ' ',
    '&mdash;': '\u2014',
    '&ndash;': '\u2013',
    '&hellip;': '\u2026',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return decoded;
}

// VTT -> plain text converter
export function parseVttToText(content: string): string {
  const cleanedLines = content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^WEBVTT/i.test(trimmed)) return false;
      if (/^NOTE/i.test(trimmed)) return false;
      if (/^Kind:/i.test(trimmed)) return false;
      if (/^Language:/i.test(trimmed)) return false;
      if (/^\d{2}:\d{2}:\d{2}\.\d{3}\s+--\>/.test(trimmed)) return false;
      if (/^\d+$/.test(trimmed)) return false;
      return true;
    })
    .map((line) => {
      const withoutTags = line.replace(/<[^>]+>/g, "");
      const normalized = withoutTags.replace(/\s+/g, " ").trim();
      return decodeHTMLEntities(normalized);
    })
    .filter((line) => line.length > 0);

  const out: string[] = [];
  const recent: string[] = [];

  for (const line of cleanedLines) {
    const lc = line.toLowerCase();
    const isRecentDup = recent.some((r) => r === lc);
    const tail = out.join(" ");
    const tailSlice = tail.slice(Math.max(0, tail.length - 600)).toLowerCase();
    const isTailDup = lc.length > 10 && tailSlice.includes(lc);

    if (isRecentDup || isTailDup) continue;

    out.push(line);
    recent.push(lc);
    if (recent.length > 8) recent.shift();
  }

  return out.join(" ").replace(/\s+/g, " ").trim();
}

// VTT -> segments with timestamps
export function parseVttToSegments(content: string): Array<{ start: number; end: number; text: string }> {
  const lines = content.split(/\r?\n/);
  const segs: Array<{ start: number; end: number; text: string }> = [];
  let i = 0;
  const recent: string[] = [];

  const parseTime = (t: string): number => {
    const m = t.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (!m) return 0;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const ss = Number(m[3]);
    const ms = Number(m[4]);
    return hh * 3600 + mm * 60 + ss + ms / 1000;
  };

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;
    if (!line) continue;
    if (/^WEBVTT/i.test(line) || /^NOTE/i.test(line) || /^Kind:/i.test(line) || /^Language:/i.test(line)) {
      continue;
    }
    if (/^\d+$/.test(line)) {
      if (i >= lines.length) break;
    }
    const timing = lines[i - 1].includes("-->") ? lines[i - 1] : lines[i]?.trim() ?? "";
    let timingLine = timing;
    if (!/\d{2}:\d{2}:\d{2}\.\d{3}\s+--\>/.test(timingLine)) {
      if (!/\d{2}:\d{2}:\d{2}\.\d{3}\s+--\>/.test(line)) continue;
      timingLine = line;
    } else {
      i++;
    }
    const tm = timingLine.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s+--\>\s+(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (!tm) continue;
    const start = parseTime(tm[1]);
    const end = parseTime(tm[2]);

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      const raw = lines[i];
      i++;
      const withoutTags = raw.replace(/<[^>]+>/g, "");
      const cleaned = withoutTags.replace(/\s+/g, " ").trim();
      if (cleaned) textLines.push(cleaned);
    }

    const text = textLines.join(" ").trim();
    if (!text) continue;

    const decodedText = decodeHTMLEntities(text);
    const lc = decodedText.toLowerCase();
    const tail = recent.join(" ");
    const tailSlice = tail.slice(Math.max(0, tail.length - 600));
    const isDup = recent.includes(lc) || (lc.length > 10 && tailSlice.includes(lc));
    if (isDup) continue;

    segs.push({ start, end, text: decodedText });
    recent.push(lc);
    if (recent.length > 16) recent.shift();
  }

  return segs;
}

async function upsertVideoSearchFts(db: any, videoId: string, title: string | null | undefined, transcript: string | null | undefined) {
  try {
    await db.run(sql`INSERT INTO video_search_fts (video_id, title, transcript) VALUES (${videoId}, ${title ?? ""}, ${transcript ?? ""})`);
  } catch {
    logger.debug("[fts] insert skipped", { videoId, reason: "already exists or error" });
  }
}

export const transcriptsRouter = t.router({
  // Get transcript (if available) for a video (optionally by language)
  get: publicProcedure
    .input(z.object({ videoId: z.string(), lang: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      let rows;
      if (input.lang) {
        const normalizedLang = normalizeLangCode(input.lang);
        const allTranscripts = await db
          .select()
          .from(videoTranscripts)
          .where(eq(videoTranscripts.videoId, input.videoId));
        rows = allTranscripts.filter(t => normalizeLangCode(t.language) === normalizedLang);
      } else {
        rows = await db
          .select()
          .from(videoTranscripts)
          .where(eq(videoTranscripts.videoId, input.videoId))
          .limit(1);
      }
      if (rows.length === 0) return null;

      const row = rows[0] as { id: string; videoId: string; text: string | null; language?: string | null; updatedAt?: number | null; rawVtt?: string | null };

      // If the stored transcript still contains inline VTT tags, sanitize on read
      const t = row.text ?? "";
      const looksLikeVttInline = /<\d{2}:\d{2}:\d{2}\.\d{3}>|<c>|<\/c>|WEBVTT|Kind:|Language:|--\>/i.test(t);
      if (looksLikeVttInline) {
        try {
          const cleaned = parseVttToText(t);
          if (cleaned && cleaned !== t) {
            const now = Date.now();
            await db
              .update(videoTranscripts)
              .set({ text: cleaned, updatedAt: now })
              .where(eq(videoTranscripts.id, row.id));

            try {
              const vid = await db
                .select({ title: youtubeVideos.title })
                .from(youtubeVideos)
                .where(eq(youtubeVideos.videoId, input.videoId))
                .limit(1);
              const title = vid[0]?.title ?? null;
              await upsertVideoSearchFts(db, input.videoId, title, cleaned);
            } catch (e) {
              logger.warn("[fts] update after transcript sanitize failed", { videoId: input.videoId, error: String(e) });
            }

            return { ...row, text: cleaned, updatedAt: now } as typeof row;
          }
        } catch (e) {
          logger.warn("[transcript] sanitize on read failed", { videoId: input.videoId, error: String(e) });
        }
      }

      // If text missing but rawVtt present, derive and persist
      if ((!row.text || row.text.trim().length === 0) && row.rawVtt) {
        try {
          const derived = parseVttToText(row.rawVtt);
          const now = Date.now();
          await db
            .update(videoTranscripts)
            .set({ text: derived, updatedAt: now })
            .where(eq(videoTranscripts.id, row.id));
          return { ...row, text: derived, updatedAt: now } as typeof row;
        } catch {}
      }

      return row;
    }),

  // Download transcript via yt-dlp and store it (for specific language)
  download: publicProcedure
    .input(z.object({ videoId: z.string(), lang: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;

      logger.info("[transcript] download called", { videoId: input.videoId, requestedLang: input.lang ?? "default" });

      // Check DB first
      try {
        let existing;
        if (input.lang) {
          const normalizedLang = normalizeLangCode(input.lang);
          const allTranscripts = await db
            .select()
            .from(videoTranscripts)
            .where(eq(videoTranscripts.videoId, input.videoId));
          existing = allTranscripts.filter(t => normalizeLangCode(t.language) === normalizedLang);
        } else {
          existing = await db
            .select()
            .from(videoTranscripts)
            .where(eq(videoTranscripts.videoId, input.videoId))
            .limit(1);
        }

        if (existing.length > 0) {
          const row = existing[0];
          if (row.text && row.rawVtt && row.text.trim().length > 0 && row.rawVtt.trim().length > 0) {
            logger.info("[transcript] found existing in DB", { videoId: input.videoId });
            return {
              success: true as const,
              videoId: input.videoId,
              language: row.language ?? input.lang ?? "en",
              length: row.text.length,
              fromCache: true as const
            } as const;
          }
          // Has rawVtt but missing text - derive it
          if (row.rawVtt && row.rawVtt.trim().length > 0) {
            try {
              const derived = parseVttToText(row.rawVtt);
              const segs = parseVttToSegments(row.rawVtt);
              const segmentsJson = JSON.stringify(segs);
              const now = Date.now();
              await db
                .update(videoTranscripts)
                .set({ text: derived, segmentsJson, updatedAt: now })
                .where(sql`${videoTranscripts.videoId} = ${input.videoId} AND ${videoTranscripts.language} = ${row.language}`);

              try {
                const vid = await db
                  .select({ title: youtubeVideos.title })
                  .from(youtubeVideos)
                  .where(eq(youtubeVideos.videoId, input.videoId))
                  .limit(1);
                const title = vid[0]?.title ?? null;
                await upsertVideoSearchFts(db, input.videoId, title, derived);
              } catch {
                logger.warn("[fts] update failed", { videoId: input.videoId });
              }

              return {
                success: true as const,
                videoId: input.videoId,
                language: row.language ?? input.lang ?? "en",
                length: derived.length,
                fromCache: true as const
              } as const;
            } catch {
              logger.warn("[transcript] derive from rawVtt failed", { videoId: input.videoId });
            }
          }
        }
      } catch {
        logger.error("[transcript] DB check failed", { videoId: input.videoId });
      }

      // Download from yt-dlp
      const lang = input.lang ?? "en";
      const { getBinaryFilePath } = await import("./binary");
      const binPath = getBinaryFilePath();

      if (!fs.existsSync(binPath)) {
        return { success: false as const, message: "yt-dlp binary not installed" } as const;
      }

      const transcriptsDir = getTranscriptsDir();
      ensureDirSync(transcriptsDir);
      const url = `https://www.youtube.com/watch?v=${input.videoId}`;

      const args = [
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--no-warnings",
        "--retries",
        "2",
        "--sleep-requests",
        "2.5",
        "--sub-format",
        "vtt",
        "--sub-langs",
        `${lang},${lang}-orig,${lang}.*`,
        "-o",
        path.join(transcriptsDir, "%(id)s.%(ext)s"),
        url,
      ];

      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawnYtDlpWithLogging(
            binPath,
            args,
            { stdio: ["ignore", "pipe", "pipe"] },
            {
              operation: "download_transcript",
              url,
              videoId: input.videoId,
              other: { language: lang },
            }
          );
          let err = "";
          proc.stderr?.on("data", (d) => (err += d.toString()));
          proc.on("error", reject);
          proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err || `yt-dlp exited ${code}`))));
        });
      } catch (e) {
        const msg = String(e);
        logger.error("[transcript] yt-dlp failed", e as Error);
        const rateLimited = /429|Too Many Requests/i.test(msg);
        if (rateLimited) {
          return {
            success: false as const,
            code: "RATE_LIMITED" as const,
            retryAfterMs: 15 * 60 * 1000,
            message: msg,
          } as const;
        }
        return { success: false as const, message: msg } as const;
      }

      // Find resulting VTT file
      let vttPath: string | null = null;
      try {
        const files = fs.readdirSync(transcriptsDir).filter((f) => f.startsWith(input.videoId) && f.endsWith(".vtt"));
        if (files.length > 0) {
          const withStat = files.map((f) => ({ f, s: fs.statSync(path.join(transcriptsDir, f)) }));
          withStat.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
          vttPath = path.join(transcriptsDir, withStat[0].f);
        }
      } catch {}

      if (!vttPath || !fs.existsSync(vttPath)) {
        return { success: false as const, message: "Transcript file not found after yt-dlp" } as const;
      }

      // Parse VTT
      const raw = fs.readFileSync(vttPath, "utf8");
      const text = parseVttToText(raw);
      const segs = parseVttToSegments(raw);
      const segmentsJson = JSON.stringify(segs);
      const now = Date.now();

      // Detect language from filename
      const langMatch = path.basename(vttPath).match(/\.(\w[\w-]*)\.vtt$/i);
      const rawDetectedLang = (langMatch?.[1] ?? lang).toLowerCase();
      const detectedLang = normalizeLangCode(rawDetectedLang);

      // Store in DB
      try {
        const existing = await db
          .select()
          .from(videoTranscripts)
          .where(sql`${videoTranscripts.videoId} = ${input.videoId} AND ${videoTranscripts.language} = ${detectedLang}`)
          .limit(1);

        if (existing.length === 0) {
          await db.insert(videoTranscripts).values({
            id: crypto.randomUUID(),
            videoId: input.videoId,
            language: detectedLang,
            isAutoGenerated: true,
            source: "yt-dlp",
            text,
            rawVtt: raw,
            segmentsJson,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await db
            .update(videoTranscripts)
            .set({
              isAutoGenerated: true,
              source: "yt-dlp",
              text,
              rawVtt: raw,
              segmentsJson,
              updatedAt: now,
            })
            .where(sql`${videoTranscripts.videoId} = ${input.videoId} AND ${videoTranscripts.language} = ${detectedLang}`);
        }
      } catch (e) {
        logger.error("[transcript] upsert failed", e as Error);
        return { success: false as const, message: "Failed to store transcript" } as const;
      }

      // Update FTS index
      try {
        const vid = await db
          .select({ title: youtubeVideos.title })
          .from(youtubeVideos)
          .where(eq(youtubeVideos.videoId, input.videoId))
          .limit(1);
        const title = vid[0]?.title ?? null;
        await upsertVideoSearchFts(db, input.videoId, title, text);
      } catch {
        logger.warn("[fts] update failed", { videoId: input.videoId });
      }

      return { success: true as const, videoId: input.videoId, language: detectedLang, length: text.length } as const;
    }),

  // Get transcript segments with timestamps for highlighting
  getSegments: publicProcedure
    .input(z.object({ videoId: z.string(), lang: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;

      try {
        let rows;
        if (input.lang) {
          const normalizedLang = normalizeLangCode(input.lang);
          const allTranscripts = await db
            .select()
            .from(videoTranscripts)
            .where(eq(videoTranscripts.videoId, input.videoId));
          rows = allTranscripts.filter(t => normalizeLangCode(t.language) === normalizedLang);
        } else {
          rows = await db
            .select()
            .from(videoTranscripts)
            .where(eq(videoTranscripts.videoId, input.videoId))
            .limit(1);
        }

        if (rows.length > 0) {
          const row = rows[0] as { id: string; rawVtt?: string | null; segmentsJson?: string | null; language?: string | null };
          if (row.segmentsJson) {
            try {
              const segs = JSON.parse(row.segmentsJson) as Array<{ start: number; end: number; text: string }>;
              return { segments: segs, language: (row as any).language ?? input.lang } as const;
            } catch {}
          }
          if (row.rawVtt) {
            const segs = parseVttToSegments(row.rawVtt);
            try {
              await db
                .update(videoTranscripts)
                .set({ segmentsJson: JSON.stringify(segs), updatedAt: Date.now() })
                .where(eq(videoTranscripts.id, (row as any).id));
            } catch {}
            return { segments: segs, language: (row as any).language ?? input.lang } as const;
          }
        }
      } catch {}

      // Fallback to cached VTT files on disk
      const transcriptsDir = getTranscriptsDir();
      try {
        const files = fs
          .readdirSync(transcriptsDir)
          .filter((f) => f.startsWith(input.videoId) && f.endsWith(".vtt"));
        if (files.length === 0) return { segments: [] as Array<{ start: number; end: number; text: string }>, language: input.lang } as const;

        const pickByLang = (lang: string, arr: string[]) => {
          const re = new RegExp(`\\.${lang}(?:[.-]|\\.vtt$)`, "i");
          const candidates = arr.filter((f) => re.test(f));
          if (candidates.length > 0) return candidates;
          return arr;
        };

        const candidates = input.lang ? pickByLang(input.lang, files) : files;
        const withStat = candidates.map((f) => ({ f, s: fs.statSync(path.join(transcriptsDir, f)) }));
        withStat.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
        const vttPath = path.join(transcriptsDir, withStat[0].f);
        const raw = fs.readFileSync(vttPath, "utf8");
        const segments = parseVttToSegments(raw);
        return { segments, language: input.lang } as const;
      } catch {
        return { segments: [] as Array<{ start: number; end: number; text: string }>, language: input.lang } as const;
      }
    }),
});

export type TranscriptsRouter = typeof transcriptsRouter;

