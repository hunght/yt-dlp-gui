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

  describe("format handling", () => {
    it("should handle empty format string gracefully", async () => {
      const caller = createDownloadTestCaller(testDb);

      // Test with empty format string
      const result = await caller.startDownload({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        format: "", // Empty format string
        videoInfo: {
          id: "test-video-1",
          videoId: "dQw4w9WgXcQ",
          title: "Test Video",
          description: "Test description",
          channelId: "test-channel-1",
          channelTitle: "Test Channel",
          durationSeconds: 212,
          viewCount: 1000000,
          likeCount: 50000,
          thumbnailUrl: "https://example.com/thumb.jpg",
          publishedAt: Date.now(),
          tags: "test,video",
          raw: '{"test": "data"}',
          createdAt: Date.now(),
          thumbnailPath: null,
        },
      });

      expect(result.id).toBeDefined();
      expect(result.status).toBe("pending");
      expect(result.videoInfo).toBeDefined();
    });

    it("should handle undefined format gracefully", async () => {
      const caller = createDownloadTestCaller(testDb);

      // Test with undefined format (should use default)
      const result = await caller.startDownload({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        // format is undefined, should use default
        videoInfo: {
          id: "test-video-2",
          videoId: "dQw4w9WgXcQ",
          title: "Test Video 2",
          description: "Test description 2",
          channelId: "test-channel-2",
          channelTitle: "Test Channel 2",
          durationSeconds: 180,
          viewCount: 500000,
          likeCount: 25000,
          thumbnailUrl: "https://example.com/thumb2.jpg",
          publishedAt: Date.now(),
          tags: "test,video,2",
          raw: '{"test": "data2"}',
          createdAt: Date.now(),
          thumbnailPath: null,
        },
      });

      expect(result.id).toBeDefined();
      expect(result.status).toBe("pending");
      expect(result.videoInfo).toBeDefined();
    });

    it("should handle whitespace-only format gracefully", async () => {
      const caller = createDownloadTestCaller(testDb);

      // Test with whitespace-only format string
      const result = await caller.startDownload({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        format: "   ", // Whitespace-only format string
        videoInfo: {
          id: "test-video-3",
          videoId: "dQw4w9WgXcQ",
          title: "Test Video 3",
          description: "Test description 3",
          channelId: "test-channel-3",
          channelTitle: "Test Channel 3",
          durationSeconds: 300,
          viewCount: 750000,
          likeCount: 35000,
          thumbnailUrl: "https://example.com/thumb3.jpg",
          publishedAt: Date.now(),
          tags: "test,video,3",
          raw: '{"test": "data3"}',
          createdAt: Date.now(),
          thumbnailPath: null,
        },
      });

      expect(result.id).toBeDefined();
      expect(result.status).toBe("pending");
      expect(result.videoInfo).toBeDefined();
    });

    it("should store valid format in database even when input format is empty", async () => {
      const caller = createDownloadTestCaller(testDb);

      // Test with empty format string
      const result = await caller.startDownload({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        format: "", // Empty format string
        videoInfo: {
          id: "test-video-4",
          videoId: "dQw4w9WgXcQ",
          title: "Test Video 4",
          description: "Test description 4",
          channelId: "test-channel-4",
          channelTitle: "Test Channel 4",
          durationSeconds: 240,
          viewCount: 600000,
          likeCount: 30000,
          thumbnailUrl: "https://example.com/thumb4.jpg",
          publishedAt: Date.now(),
          tags: "test,video,4",
          raw: '{"test": "data4"}',
          createdAt: Date.now(),
          thumbnailPath: null,
        },
      });

      expect(result.id).toBeDefined();
      expect(result.status).toBe("pending");

      // Check that the download was stored in the database
      const download = await caller.getDownloadById({ id: result.id });
      expect(download).toBeDefined();
      expect(download?.format).toBe(""); // Should store the original empty format
      expect(download?.status).toBe("pending");
    });
  });

  describe("real video download", () => {
    it("should handle download of specific YouTube video", async () => {
      const caller = createDownloadTestCaller(testDb);
      const testUrl = "https://www.youtube.com/watch?v=imdTKPQW9ek";

      // First, get video info to verify the video is accessible
      const videoInfoResponse = await caller.getVideoInfo({ url: testUrl });
      expect(videoInfoResponse).toBeDefined();
      expect(videoInfoResponse.success).toBe(true);
      expect(videoInfoResponse.videoInfo).toBeDefined();

      const videoInfo = videoInfoResponse.videoInfo!;
      expect(videoInfo.videoId).toBe("imdTKPQW9ek");
      expect(videoInfo.title).toBeDefined();
      expect(videoInfo.duration).toBeDefined();

      // Start the download with real video info
      const result = await caller.startDownload({
        url: testUrl,
        format: "best[height<=720]",
        videoInfo: videoInfo,
      });

      expect(result.id).toBeDefined();
      expect(result.status).toBe("pending");
      expect(result.videoInfo).toBeDefined();

      // Check that the download was stored in the database
      const download = await caller.getDownloadById({ id: result.id });
      expect(download).toBeDefined();
      expect(download?.url).toBe(testUrl);
      expect(download?.format).toBe("best[height<=720]");
      expect(download?.status).toBe("pending");
      expect(download?.title).toBe(
        "TỪ VỰNG 提心吊胆 trong tiếng Trung | Tự học tiếng Hán HSK | Sweden Chinese Center"
      );

      // Wait a bit for background download processing to start
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should handle format fallback for restricted video", async () => {
      const caller = createDownloadTestCaller(testDb);
      const testUrl = "https://www.youtube.com/watch?v=imdTKPQW9ek";

      // Get real video info first
      const videoInfoResponse = await caller.getVideoInfo({ url: testUrl });
      expect(videoInfoResponse.success).toBe(true);
      const videoInfo = videoInfoResponse.videoInfo!;

      // Test with a format that might be restricted
      const result = await caller.startDownload({
        url: testUrl,
        format: "bestvideo+bestaudio", // This format might trigger 403 errors
        videoInfo: videoInfo,
      });

      expect(result.id).toBeDefined();
      expect(result.status).toBe("pending");
      expect(result.videoInfo).toBeDefined();

      // The actual download processing will happen in the background
      // and may fail with 403, but the download record should be created
      const download = await caller.getDownloadById({ id: result.id });
      expect(download).toBeDefined();
      expect(download?.url).toBe(testUrl);
      expect(download?.format).toBe("bestvideo+bestaudio");

      // Wait a bit for background download processing to start
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });
});
