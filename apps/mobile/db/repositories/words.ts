import { and, desc, eq } from "drizzle-orm";
import { getDb, savedWords, translationCache } from "../index";
import type { RemoteSavedWord, TranslateResult } from "../../types";

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

interface UpsertTranslationInput {
  translationId?: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  detectedLang?: string;
}

interface UpsertSavedWordInput {
  id?: string;
  translationId: string;
  notes?: string | null;
  reviewCount?: number;
  lastReviewedAt?: number | null;
  createdAt?: number;
}

interface LocalTranslationLookupInput {
  sourceText: string;
  targetLang: string;
  sourceLang?: string;
}

function getSavedWordById(id: string): RemoteSavedWord | undefined {
  const row = getDb()
    .select({
      id: savedWords.id,
      notes: savedWords.notes,
      reviewCount: savedWords.reviewCount,
      lastReviewedAt: savedWords.lastReviewedAt,
      createdAt: savedWords.createdAt,
      sourceText: translationCache.sourceText,
      translatedText: translationCache.translatedText,
      sourceLang: translationCache.sourceLang,
      targetLang: translationCache.targetLang,
      translationId: savedWords.translationId,
    })
    .from(savedWords)
    .innerJoin(translationCache, eq(savedWords.translationId, translationCache.id))
    .where(eq(savedWords.id, id))
    .get();

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    notes: row.notes ?? null,
    reviewCount: row.reviewCount ?? 0,
    lastReviewedAt: row.lastReviewedAt ?? null,
    createdAt: row.createdAt,
    sourceText: row.sourceText,
    translatedText: row.translatedText,
    sourceLang: row.sourceLang,
    targetLang: row.targetLang,
    translationId: row.translationId,
  };
}

function upsertTranslation(input: UpsertTranslationInput): string {
  const now = Date.now();
  const normalizedSource = input.sourceText.trim();
  const normalizedTarget = input.translatedText.trim();
  const normalizedSourceLang = input.sourceLang.trim() || "auto";
  const normalizedTargetLang = input.targetLang.trim() || "en";

  const existingByText = getDb()
    .select()
    .from(translationCache)
    .where(
      and(
        eq(translationCache.sourceText, normalizedSource),
        eq(translationCache.sourceLang, normalizedSourceLang),
        eq(translationCache.targetLang, normalizedTargetLang)
      )
    )
    .get();

  if (existingByText) {
    getDb()
      .update(translationCache)
      .set({
        translatedText: normalizedTarget,
        detectedLang: input.detectedLang ?? existingByText.detectedLang,
        queryCount: (existingByText.queryCount ?? 0) + 1,
        lastQueriedAt: now,
        updatedAt: now,
      })
      .where(eq(translationCache.id, existingByText.id))
      .run();
    return existingByText.id;
  }

  const translationId = input.translationId?.trim() || generateId();
  const existingById = getDb()
    .select()
    .from(translationCache)
    .where(eq(translationCache.id, translationId))
    .get();

  if (existingById) {
    getDb()
      .update(translationCache)
      .set({
        sourceText: normalizedSource,
        translatedText: normalizedTarget,
        sourceLang: normalizedSourceLang,
        targetLang: normalizedTargetLang,
        detectedLang: input.detectedLang ?? existingById.detectedLang,
        queryCount: (existingById.queryCount ?? 0) + 1,
        lastQueriedAt: now,
        updatedAt: now,
      })
      .where(eq(translationCache.id, existingById.id))
      .run();
    return existingById.id;
  }

  getDb()
    .insert(translationCache)
    .values({
      id: translationId,
      sourceText: normalizedSource,
      sourceLang: normalizedSourceLang,
      targetLang: normalizedTargetLang,
      translatedText: normalizedTarget,
      detectedLang: input.detectedLang ?? null,
      queryCount: 1,
      firstQueriedAt: now,
      lastQueriedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return translationId;
}

function upsertSavedWord(input: UpsertSavedWordInput): string {
  const now = Date.now();
  const existing = getDb()
    .select()
    .from(savedWords)
    .where(eq(savedWords.translationId, input.translationId))
    .get();

  if (existing) {
    getDb()
      .update(savedWords)
      .set({
        notes: input.notes ?? existing.notes,
        reviewCount: input.reviewCount ?? existing.reviewCount,
        lastReviewedAt:
          input.lastReviewedAt === undefined
            ? existing.lastReviewedAt
            : input.lastReviewedAt,
        updatedAt: now,
      })
      .where(eq(savedWords.id, existing.id))
      .run();
    return existing.id;
  }

  const id = input.id ?? generateId();
  getDb()
    .insert(savedWords)
    .values({
      id,
      translationId: input.translationId,
      notes: input.notes ?? null,
      reviewCount: input.reviewCount ?? 0,
      lastReviewedAt:
        input.lastReviewedAt === undefined ? null : input.lastReviewedAt,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    })
    .run();

  return id;
}

function normalizeLookupInput(input: LocalTranslationLookupInput) {
  return {
    sourceText: input.sourceText.trim(),
    sourceTextLower: input.sourceText.trim().toLowerCase(),
    targetLang: input.targetLang.trim() || "en",
    sourceLang: input.sourceLang?.trim(),
  };
}

function bumpTranslationLookupStats(translationId: string) {
  const now = Date.now();
  const existing = getDb()
    .select()
    .from(translationCache)
    .where(eq(translationCache.id, translationId))
    .get();

  if (!existing) {
    return;
  }

  getDb()
    .update(translationCache)
    .set({
      queryCount: (existing.queryCount ?? 0) + 1,
      lastQueriedAt: now,
      updatedAt: now,
    })
    .where(eq(translationCache.id, translationId))
    .run();
}

export function getCachedTranslationLocal(
  input: LocalTranslationLookupInput
): TranslateResult | undefined {
  const normalized = normalizeLookupInput(input);
  if (!normalized.sourceText) {
    return undefined;
  }

  const exactMatch = normalized.sourceLang
    ? getDb()
        .select()
        .from(translationCache)
        .where(
          and(
            eq(translationCache.sourceText, normalized.sourceText),
            eq(translationCache.sourceLang, normalized.sourceLang),
            eq(translationCache.targetLang, normalized.targetLang)
          )
        )
        .get()
    : getDb()
        .select()
        .from(translationCache)
        .where(
          and(
            eq(translationCache.sourceText, normalized.sourceText),
            eq(translationCache.targetLang, normalized.targetLang)
          )
        )
        .get();

  const caseInsensitiveMatch =
    exactMatch ??
    getDb()
      .select()
      .from(translationCache)
      .where(eq(translationCache.targetLang, normalized.targetLang))
      .all()
      .find((entry) => {
        if (entry.sourceText.trim().toLowerCase() !== normalized.sourceTextLower) {
          return false;
        }

        if (!normalized.sourceLang) {
          return true;
        }

        return entry.sourceLang === normalized.sourceLang;
      });

  if (!caseInsensitiveMatch) {
    return undefined;
  }

  bumpTranslationLookupStats(caseInsensitiveMatch.id);

  return {
    success: true,
    translatedText: caseInsensitiveMatch.translatedText,
    translationId: caseInsensitiveMatch.id,
    detectedLang:
      caseInsensitiveMatch.detectedLang ??
      caseInsensitiveMatch.sourceLang ??
      "auto",
    fromCache: true,
  };
}

export function cacheTranslationLocal(input: {
  translationId?: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  detectedLang?: string;
}): string {
  return upsertTranslation({
    translationId: input.translationId,
    sourceText: input.sourceText,
    translatedText: input.translatedText,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    detectedLang: input.detectedLang,
  });
}

export function getAllSavedWordsLocal(): RemoteSavedWord[] {
  const rows = getDb()
    .select({
      id: savedWords.id,
      notes: savedWords.notes,
      reviewCount: savedWords.reviewCount,
      lastReviewedAt: savedWords.lastReviewedAt,
      createdAt: savedWords.createdAt,
      sourceText: translationCache.sourceText,
      translatedText: translationCache.translatedText,
      sourceLang: translationCache.sourceLang,
      targetLang: translationCache.targetLang,
      translationId: savedWords.translationId,
    })
    .from(savedWords)
    .innerJoin(translationCache, eq(savedWords.translationId, translationCache.id))
    .orderBy(desc(savedWords.createdAt))
    .all();

  return rows.map((row) => ({
    id: row.id,
    notes: row.notes ?? null,
    reviewCount: row.reviewCount ?? 0,
    lastReviewedAt: row.lastReviewedAt ?? null,
    createdAt: row.createdAt,
    sourceText: row.sourceText,
    translatedText: row.translatedText,
    sourceLang: row.sourceLang,
    targetLang: row.targetLang,
    translationId: row.translationId,
  }));
}

export function saveTranslatedWordLocal(input: {
  translationId?: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  detectedLang?: string;
  notes?: string | null;
}): RemoteSavedWord | undefined {
  const translationId = upsertTranslation({
    translationId: input.translationId,
    sourceText: input.sourceText,
    translatedText: input.translatedText,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    detectedLang: input.detectedLang,
  });

  const savedWordId = upsertSavedWord({
    translationId,
    notes: input.notes,
  });

  return getSavedWordById(savedWordId);
}

export function upsertRemoteSavedWords(words: RemoteSavedWord[]): void {
  for (const word of words) {
    const translationId = upsertTranslation({
      translationId: word.translationId,
      sourceText: word.sourceText,
      translatedText: word.translatedText,
      sourceLang: word.sourceLang,
      targetLang: word.targetLang,
      detectedLang: word.sourceLang,
    });

    upsertSavedWord({
      id: word.id,
      translationId,
      notes: word.notes,
      reviewCount: word.reviewCount,
      lastReviewedAt: word.lastReviewedAt,
      createdAt: word.createdAt,
    });
  }
}
