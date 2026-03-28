import { asc, desc, eq } from "drizzle-orm";
import { flashcardReviewQueue, flashcards, getDb } from "../index";
import type { RemoteFlashcard } from "../../types";

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function parseTimestampMs(value?: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoString(value?: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return new Date(value).toISOString();
}

function parseTags(tagsJson?: string | null): string[] {
  if (!tagsJson) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(tagsJson);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function serializeTags(tags: string[]): string | null {
  if (tags.length === 0) {
    return null;
  }

  return JSON.stringify(tags);
}

function toRemoteFlashcard(
  card: typeof flashcards.$inferSelect
): RemoteFlashcard {
  const cardType = card.cardType;
  const normalizedCardType =
    cardType === "cloze" || cardType === "concept" ? cardType : "basic";

  return {
    id: card.id,
    videoId: card.videoId ?? null,
    frontContent: card.frontContent,
    backContent: card.backContent,
    contextText: card.contextText ?? null,
    cardType: normalizedCardType,
    tags: parseTags(card.tagsJson),
    clozeContent: card.clozeContent ?? null,
    difficulty: card.difficulty ?? 0,
    nextReviewAt: toIsoString(card.nextReviewAt),
    reviewCount: card.reviewCount ?? 0,
    easeFactor: card.easeFactor ?? 250,
    interval: card.interval ?? 0,
    createdAt: toIsoString(card.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIsoString(card.updatedAt),
  };
}

function getFlashcardRowById(id: string) {
  return getDb().select().from(flashcards).where(eq(flashcards.id, id)).get();
}

export function getAllFlashcardsLocal(): RemoteFlashcard[] {
  return getDb()
    .select()
    .from(flashcards)
    .orderBy(desc(flashcards.createdAt))
    .all()
    .map(toRemoteFlashcard);
}

export function getDueFlashcardsLocal(now = Date.now()): RemoteFlashcard[] {
  return getDb()
    .select()
    .from(flashcards)
    .all()
    .filter((card) => typeof card.nextReviewAt === "number" && card.nextReviewAt <= now)
    .sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0))
    .map(toRemoteFlashcard);
}

export function replaceRemoteFlashcards(cards: RemoteFlashcard[]): void {
  const existingCards = getDb().select().from(flashcards).all();
  const existingIds = new Set(existingCards.map((card) => card.id));
  const remoteIds = new Set<string>();

  for (const card of cards) {
    remoteIds.add(card.id);
    const existing = existingCards.find((entry) => entry.id === card.id);
    const now = Date.now();
    const createdAt = parseTimestampMs(card.createdAt) ?? existing?.createdAt ?? now;
    const updatedAt = parseTimestampMs(card.updatedAt) ?? now;

    const values = {
      videoId: card.videoId ?? null,
      frontContent: card.frontContent,
      backContent: card.backContent,
      contextText: card.contextText ?? null,
      cardType: card.cardType,
      tagsJson: serializeTags(card.tags),
      clozeContent: card.clozeContent ?? null,
      timestampSeconds: existing?.timestampSeconds ?? null,
      difficulty: card.difficulty,
      nextReviewAt: parseTimestampMs(card.nextReviewAt),
      reviewCount: card.reviewCount,
      easeFactor: card.easeFactor,
      interval: card.interval,
      createdAt,
      updatedAt,
    };

    if (existing) {
      getDb()
        .update(flashcards)
        .set(values)
        .where(eq(flashcards.id, card.id))
        .run();
    } else {
      getDb()
        .insert(flashcards)
        .values({
          id: card.id,
          ...values,
        })
        .run();
    }
  }

  for (const existingId of existingIds) {
    if (remoteIds.has(existingId)) {
      continue;
    }

    getDb().delete(flashcards).where(eq(flashcards.id, existingId)).run();
  }
}

function calculateNextReview(currentInterval: number, currentEase: number, grade: number) {
  let newInterval = currentInterval;
  let newEaseFactor = currentEase;

  if (grade >= 3) {
    if (currentInterval === 0) {
      newInterval = 1;
    } else if (currentInterval === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(currentInterval * currentEase);
    }

    newEaseFactor =
      currentEase + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (newEaseFactor < 1.3) {
      newEaseFactor = 1.3;
    }
  } else {
    newInterval = 1;
  }

  return {
    newInterval,
    newEaseFactor,
  };
}

export function applyFlashcardReviewLocal(
  id: string,
  grade: number
): RemoteFlashcard | undefined {
  const card = getFlashcardRowById(id);
  if (!card) {
    return undefined;
  }

  const currentEase = (card.easeFactor ?? 250) / 100;
  const currentInterval = card.interval ?? 0;
  const { newInterval, newEaseFactor } = calculateNextReview(
    currentInterval,
    currentEase,
    grade
  );

  const nextReviewAt = Date.now() + newInterval * 24 * 60 * 60 * 1000;
  const updatedAt = Date.now();

  getDb()
    .update(flashcards)
    .set({
      interval: newInterval,
      easeFactor: Math.round(newEaseFactor * 100),
      nextReviewAt,
      reviewCount: (card.reviewCount ?? 0) + 1,
      updatedAt,
    })
    .where(eq(flashcards.id, id))
    .run();

  const updated = getFlashcardRowById(id);
  return updated ? toRemoteFlashcard(updated) : undefined;
}

export function queueFlashcardReviewLocal(flashcardId: string, grade: number): string {
  const id = generateId();
  getDb()
    .insert(flashcardReviewQueue)
    .values({
      id,
      flashcardId,
      grade,
      createdAt: Date.now(),
    })
    .run();

  return id;
}

export function getPendingFlashcardReviewsLocal(): Array<
  typeof flashcardReviewQueue.$inferSelect
> {
  return getDb()
    .select()
    .from(flashcardReviewQueue)
    .orderBy(asc(flashcardReviewQueue.createdAt))
    .all();
}

export function removePendingFlashcardReviewLocal(id: string): void {
  getDb().delete(flashcardReviewQueue).where(eq(flashcardReviewQueue.id, id)).run();
}
