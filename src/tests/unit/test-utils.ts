import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  createTestDatabase,
  seedTestDatabase,
  clearTestDatabase,
  createTestContext,
  type TestDatabase,
} from "./test-db-setup";
import { downloadRouter } from "../../api/routers/download";
import { youtubeRouter } from "../../api/routers/youtube";
import { eq } from "drizzle-orm";
import { downloads, youtubeVideos } from "../../api/db/schema";

/**
 * Test helper to create a tRPC caller with test database for download router
 */
export function createTestCaller(testDb: TestDatabase) {
  const ctx = createTestContext(testDb.db);
  return downloadRouter.createCaller(ctx);
}

/**
 * Test helper to create a tRPC caller with test database for YouTube router
 */
export function createYouTubeTestCaller(testDb: TestDatabase) {
  const ctx = createTestContext(testDb.db);
  return youtubeRouter.createCaller(ctx);
}

/**
 * Test helper to wait for async operations
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Test helper to create a mock video info object
 */
export function createMockVideoInfo(overrides: Partial<any> = {}) {
  return {
    id: "test-video-id",
    videoId: "dQw4w9WgXcQ",
    title: "Test Video Title",
    description: "Test video description",
    channelId: "test-channel-id",
    channelTitle: "Test Channel",
    durationSeconds: 212,
    viewCount: 1000000,
    likeCount: 50000,
    thumbnailUrl: "https://example.com/thumb.jpg",
    publishedAt: Date.now() - 86400000,
    tags: JSON.stringify(["test", "video"]),
    raw: JSON.stringify({ test: "data" }),
    createdAt: Date.now(),
    thumbnailPath: null,
    ...overrides,
  };
}

/**
 * Test helper to create a mock download object
 */
export function createMockDownload(overrides: Partial<any> = {}) {
  return {
    id: "test-download-id",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "Test Video Title",
    status: "pending" as const,
    progress: 0,
    format: "best[height<=720]",
    quality: "720p",
    filePath: null,
    fileSize: null,
    errorMessage: null,
    errorType: null,
    isRetryable: true,
    metadata: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
    ...overrides,
  };
}

/**
 * Test helper to verify download exists in database
 */
export async function expectDownloadExists(
  testDb: TestDatabase,
  downloadId: string,
  expectedData?: Partial<any>
) {
  const download = await testDb.db
    .select()
    .from(downloads)
    .where(eq(downloads.id, downloadId))
    .limit(1);

  expect(download).toHaveLength(1);

  if (expectedData) {
    expect(download[0]).toMatchObject(expectedData);
  }

  return download[0];
}

/**
 * Test helper to verify download doesn't exist in database
 */
export async function expectDownloadNotExists(testDb: TestDatabase, downloadId: string) {
  const download = await testDb.db
    .select()
    .from(downloads)
    .where(eq(downloads.id, downloadId))
    .limit(1);

  expect(download).toHaveLength(0);
}

/**
 * Test helper to verify video exists in database
 */
export async function expectVideoExists(
  testDb: TestDatabase,
  videoId: string,
  expectedData?: Partial<any>
) {
  const video = await testDb.db
    .select()
    .from(youtubeVideos)
    .where(eq(youtubeVideos.videoId, videoId))
    .limit(1);

  expect(video).toHaveLength(1);

  if (expectedData) {
    expect(video[0]).toMatchObject(expectedData);
  }

  return video[0];
}

/**
 * Test helper to verify video doesn't exist in database
 */
export async function expectVideoNotExists(testDb: TestDatabase, videoId: string) {
  const video = await testDb.db
    .select()
    .from(youtubeVideos)
    .where(eq(youtubeVideos.videoId, videoId))
    .limit(1);

  expect(video).toHaveLength(0);
}

/**
 * Test helper to get download count by status
 */
export async function getDownloadCountByStatus(
  testDb: TestDatabase,
  status: "pending" | "downloading" | "completed" | "failed" | "cancelled"
): Promise<number> {
  const result = await testDb.db.select().from(downloads).where(eq(downloads.status, status));

  return result.length;
}

/**
 * Test helper to get total download count
 */
export async function getTotalDownloadCount(testDb: TestDatabase): Promise<number> {
  const result = await testDb.db.select().from(downloads);
  return result.length;
}

/**
 * Test helper to get total video count
 */
export async function getTotalVideoCount(testDb: TestDatabase): Promise<number> {
  const result = await testDb.db.select().from(youtubeVideos);
  return result.length;
}

/**
 * Test helper to create a test suite with database setup
 * Note: This is a simplified version. For complex test suites,
 * use the manual beforeEach/afterEach pattern shown in the example tests.
 */
export function createTestSuite(name: string, testFn: (testDb: TestDatabase) => void) {
  describe(name, () => {
    let testDb: TestDatabase;

    beforeEach(async () => {
      testDb = await createTestDatabase(name.replace(/\s+/g, "-").toLowerCase());
      await seedTestDatabase(testDb.db);
    });

    afterEach(async () => {
      if (testDb) {
        await testDb.cleanup();
      }
    });

    // Note: testFn should be called within individual test cases
    // This is just a placeholder - actual tests should be written manually
    it("should have database setup", () => {
      expect(testDb).toBeDefined();
    });
  });
}

/**
 * Test helper to create a test suite with shared database
 * Note: This is a simplified version. For complex test suites,
 * use the manual beforeAll/afterAll pattern shown in the example tests.
 */
export function createSharedTestSuite(name: string, testFn: (testDb: TestDatabase) => void) {
  describe(name, () => {
    let testDb: TestDatabase;

    beforeAll(async () => {
      testDb = await createTestDatabase("shared");
      await seedTestDatabase(testDb.db);
    });

    beforeEach(async () => {
      if (testDb) {
        await clearTestDatabase(testDb.db);
        await seedTestDatabase(testDb.db);
      }
    });

    afterAll(async () => {
      if (testDb) {
        await testDb.cleanup();
      }
    });

    // Note: testFn should be called within individual test cases
    // This is just a placeholder - actual tests should be written manually
    it("should have shared database setup", () => {
      expect(testDb).toBeDefined();
    });
  });
}
