import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { createTestDatabase, seedTestDatabase, type TestDatabase } from "./test-db-setup";
import {
  createDownloadTestCaller,
  createMockVideoInfo,
  createMockDownload,
  expectDownloadExists,
  expectDownloadNotExists,
  getDownloadCountByStatus,
  getTotalDownloadCount,
  waitFor,
} from "./test-utils";
import { eq } from "drizzle-orm";
import { downloads } from "../../api/db/schema";

describe("Download Router", () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDatabase("download-router");
    await seedTestDatabase(testDb.db);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe("getDownloads", () => {
    it("should return paginated downloads with default parameters", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.getDownloads({});

      expect(result).toHaveProperty("downloads");
      expect(result).toHaveProperty("pagination");
      expect(result.downloads).toHaveLength(3); // We seeded 3 downloads
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.totalCount).toBe(3);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNextPage).toBe(false);
      expect(result.pagination.hasPrevPage).toBe(false);
    });

    it("should return downloads with custom pagination", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.getDownloads({
        page: 1,
        limit: 2,
      });

      expect(result.downloads).toHaveLength(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(2);
      expect(result.pagination.totalCount).toBe(3);
      expect(result.pagination.totalPages).toBe(2);
      expect(result.pagination.hasNextPage).toBe(true);
      expect(result.pagination.hasPrevPage).toBe(false);
    });

    it("should filter downloads by status", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.getDownloads({
        status: "completed",
      });

      expect(result.downloads).toHaveLength(1);
      expect(result.downloads[0].status).toBe("completed");
      expect(result.pagination.totalCount).toBe(1);
    });

    it("should sort downloads by different fields", async () => {
      const caller = createDownloadTestCaller(testDb);

      // Test sorting by title ascending
      const resultAsc = await caller.getDownloads({
        sortBy: "title",
        sortOrder: "asc",
      });

      expect(resultAsc.downloads[0].title).toBe("Test Video 1");
      expect(resultAsc.downloads[1].title).toBe("Test Video 2");
      expect(resultAsc.downloads[2].title).toBe("Test Video 3");

      // Test sorting by title descending
      const resultDesc = await caller.getDownloads({
        sortBy: "title",
        sortOrder: "desc",
      });

      expect(resultDesc.downloads[0].title).toBe("Test Video 3");
      expect(resultDesc.downloads[1].title).toBe("Test Video 2");
      expect(resultDesc.downloads[2].title).toBe("Test Video 1");
    });

    it("should handle empty results", async () => {
      // Clear the database
      await testDb.db.delete(downloads);

      const caller = createDownloadTestCaller(testDb);

      const result = await caller.getDownloads({});

      expect(result.downloads).toHaveLength(0);
      expect(result.pagination.totalCount).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe("getDownloadById", () => {
    it("should return download by ID", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.getDownloadById({ id: "test-download-1" });

      expect(result).not.toBeNull();
      expect(result?.id).toBe("test-download-1");
      expect(result?.title).toBe("Test Video 1");
      expect(result?.status).toBe("completed");
    });

    it("should return null for non-existent download", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.getDownloadById({ id: "non-existent" });

      expect(result).toBeNull();
    });
  });

  describe("startDownload", () => {
    it("should create a new download with video info", async () => {
      const caller = createDownloadTestCaller(testDb);
      const videoInfo = createMockVideoInfo({
        videoId: "new-test-video",
        title: "New Test Video",
      });

      const result = await caller.startDownload({
        url: "https://www.youtube.com/watch?v=new-test-video",
        format: "best[height<=720]",
        videoInfo,
      });

      expect(result).toHaveProperty("id");
      expect(result.status).toBe("pending");
      expect(result.videoInfo).not.toBeNull();
      expect(result.videoInfo?.title).toBe("New Test Video");

      // Verify download was created in database
      await expectDownloadExists(testDb, result.id, {
        url: "https://www.youtube.com/watch?v=new-test-video",
        title: "New Test Video",
        status: "pending",
        format: "best[height<=720]",
      });
    });

    it("should create a new download without video info", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.startDownload({
        url: "https://www.youtube.com/watch?v=no-video-info",
        format: "best",
      });

      expect(result).toHaveProperty("id");
      expect(result.status).toBe("pending");
      expect(result.videoInfo).toBeNull();

      // Verify download was created in database
      await expectDownloadExists(testDb, result.id, {
        url: "https://www.youtube.com/watch?v=no-video-info",
        status: "pending",
        format: "best",
      });
    });

    it("should validate URL format", async () => {
      const caller = createDownloadTestCaller(testDb);

      await expect(
        caller.startDownload({
          url: "invalid-url",
          format: "best",
        })
      ).rejects.toThrow("Invalid URL");
    });
  });

  describe("cancelDownload", () => {
    it("should cancel an existing download", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.cancelDownload({ id: "test-download-3" });

      expect(result.success).toBe(true);

      // Verify download status was updated
      await expectDownloadExists(testDb, "test-download-3", {
        status: "cancelled",
      });
    });

    it("should handle cancelling non-existent download", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.cancelDownload({ id: "non-existent" });

      expect(result.success).toBe(true);
    });
  });

  describe("deleteDownload", () => {
    it("should delete an existing download", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.deleteDownload({ id: "test-download-1" });

      expect(result.success).toBe(true);

      // Verify download was deleted
      await expectDownloadNotExists(testDb, "test-download-1");
    });

    it("should handle deleting non-existent download", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.deleteDownload({ id: "non-existent" });

      expect(result.success).toBe(true);
    });
  });

  describe("retryDownload", () => {
    it("should retry a failed download", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.retryDownload({ id: "test-download-2" });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Download retry started");

      // Verify download status was reset
      await expectDownloadExists(testDb, "test-download-2", {
        status: "pending",
        progress: 0,
        errorMessage: null,
        errorType: null,
        isRetryable: true,
      });
    });

    it("should not retry a non-failed download", async () => {
      const caller = createDownloadTestCaller(testDb);

      await expect(caller.retryDownload({ id: "test-download-1" })).rejects.toThrow(
        "Can only retry failed downloads"
      );
    });

    it("should not retry a non-retryable download", async () => {
      // Update download to be non-retryable
      await testDb.db
        .update(downloads)
        .set({ isRetryable: false })
        .where(eq(downloads.id, "test-download-2"));

      const caller = createDownloadTestCaller(testDb);

      await expect(caller.retryDownload({ id: "test-download-2" })).rejects.toThrow(
        "This download cannot be retried"
      );
    });

    it("should handle retrying non-existent download", async () => {
      const caller = createDownloadTestCaller(testDb);

      await expect(caller.retryDownload({ id: "non-existent" })).rejects.toThrow(
        "Download not found"
      );
    });
  });

  describe("getDownloadDetails", () => {
    it("should return download details with video info", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.getDownloadDetails({ id: "test-download-1" });

      expect(result).toHaveProperty("id", "test-download-1");
      expect(result).toHaveProperty("title", "Test Video 1");
      expect(result).toHaveProperty("status", "completed");
      expect(result).toHaveProperty("videoInfo");
      expect(result.videoInfo).not.toBeNull();
      expect(result.videoInfo?.title).toBe("Test Video 1");
    });

    it("should return download details without video info", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.getDownloadDetails({ id: "test-download-2" });

      expect(result).toHaveProperty("id", "test-download-2");
      expect(result).toHaveProperty("title", "Test Video 2");
      expect(result).toHaveProperty("status", "failed");
      expect(result.videoInfo).not.toBeNull();
      expect(result.videoInfo?.title).toBe("Test Video 2");
    });

    it("should handle non-existent download", async () => {
      const caller = createDownloadTestCaller(testDb);

      await expect(caller.getDownloadDetails({ id: "non-existent" })).rejects.toThrow(
        "Download not found"
      );
    });
  });

  describe("getDownloadStats", () => {
    it("should return correct download statistics", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.getDownloadStats();

      expect(result).toHaveProperty("totalDownloads", 3);
      expect(result).toHaveProperty("completedDownloads", 1);
      expect(result).toHaveProperty("failedDownloads", 1);
      expect(result).toHaveProperty("pendingDownloads", 0);
      expect(result).toHaveProperty("downloadingDownloads", 1);
      expect(result).toHaveProperty("totalFileSize", 50000000);
    });

    it("should return zero stats for empty database", async () => {
      // Clear the database
      await testDb.db.delete(downloads);

      const caller = createDownloadTestCaller(testDb);

      const result = await caller.getDownloadStats();

      expect(result).toHaveProperty("totalDownloads", 0);
      expect(result).toHaveProperty("completedDownloads", 0);
      expect(result).toHaveProperty("failedDownloads", 0);
      expect(result).toHaveProperty("pendingDownloads", 0);
      expect(result).toHaveProperty("downloadingDownloads", 0);
      expect(result).toHaveProperty("totalFileSize", null);
    });
  });

  describe("getVideoInfo", () => {
    it("should handle invalid URL", async () => {
      const caller = createDownloadTestCaller(testDb);

      await expect(
        caller.getVideoInfo({
          url: "invalid-url",
        })
      ).rejects.toThrow("Invalid URL");
    });

    it("should handle network errors gracefully", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.getVideoInfo({
        url: "https://www.youtube.com/watch?v=non-existent-video",
      });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });
  });

  describe("checkVideoAccessibility", () => {
    it("should handle invalid URL", async () => {
      const caller = createDownloadTestCaller(testDb);

      await expect(
        caller.checkVideoAccessibility({
          url: "invalid-url",
        })
      ).rejects.toThrow("Invalid URL");
    });

    it("should handle network errors gracefully", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.checkVideoAccessibility({
        url: "https://www.youtube.com/watch?v=non-existent-video",
      });

      expect(result.success).toBe(false);
      expect(result.accessible).toBe(false);
      expect(result).toHaveProperty("error");
    });
  });

  describe("getAvailableFormats", () => {
    it("should handle invalid URL", async () => {
      const caller = createDownloadTestCaller(testDb);

      await expect(
        caller.getAvailableFormats({
          url: "invalid-url",
        })
      ).rejects.toThrow("Invalid URL");
    });

    it("should handle network errors gracefully", async () => {
      const caller = createDownloadTestCaller(testDb);

      const result = await caller.getAvailableFormats({
        url: "https://www.youtube.com/watch?v=non-existent-video",
      });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });
  });
});
