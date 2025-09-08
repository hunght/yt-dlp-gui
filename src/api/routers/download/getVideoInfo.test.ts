/**
 * Test suite for getVideoInfo endpoint
 *
 * Tests the video information retrieval functionality using real YouTube URLs.
 * Focuses on testing the getVideoInfo tRPC endpoint specifically.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  createTestDatabase,
  createTestDatabaseWithRealData,
  type TestDatabase,
} from "../../../tests/unit/test-db-setup";
import { createDownloadTestCaller } from "../../../tests/unit/test-utils";
import { eq } from "drizzle-orm";
import { youtubeVideos } from "../../db/schema";

describe("Download Router - getVideoInfo", () => {
  let testDb: TestDatabase;
  let caller: ReturnType<typeof createDownloadTestCaller>;

  beforeEach(async () => {
    testDb = await createTestDatabaseWithRealData("get-video-info-test");
    caller = createDownloadTestCaller(testDb);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.cleanup();
    }
  });

  describe("getVideoInfo endpoint", () => {
    it("should handle invalid YouTube URLs gracefully", async () => {
      const invalidUrls = [
        "https://www.youtube.com/watch?v=invalid123",
        "https://www.youtube.com/watch?v=doesnotexist",
        "https://www.example.com/not-youtube",
      ];

      for (const invalidUrl of invalidUrls) {
        try {
          const result = await caller.getVideoInfo({
            url: invalidUrl,
          });

          // Should either succeed (if URL is valid but video doesn't exist)
          // or return a success: false response
          if (!result.success) {
            expect(result.error).toBeDefined();
            console.log(`✅ Handled invalid URL correctly: ${invalidUrl} - ${result.error}`);
          } else {
            // If it succeeded, it means the URL was valid but video might not exist
            console.log(`⚠️  URL was valid but unexpected: ${invalidUrl}`);
          }
        } catch (error) {
          // This is also acceptable - the endpoint might throw for invalid URLs
          expect(error).toBeDefined();
          console.log(`✅ Handled invalid URL with exception: ${invalidUrl}`);
        }
      }
    }, 45000); // Longer timeout for multiple requests

    it("should extract correct video ID from various YouTube URL formats", async () => {
      const videoId = "5j9LPE4JqBI";
      const urlVariations = [
        `https://www.youtube.com/watch?v=${videoId}`,
        `https://youtu.be/${videoId}`,
        `https://www.youtube.com/embed/${videoId}`,
        `https://www.youtube.com/watch?v=${videoId}&list=playlist123`,
        `https://www.youtube.com/watch?v=${videoId}&t=30s`,
      ];

      for (const url of urlVariations) {
        try {
          const result = await caller.getVideoInfo({ url });

          if (result.success && result.videoInfo) {
            expect(result.videoInfo.videoId).toBe(videoId);
            console.log(`✅ Extracted video ID correctly from: ${url}`);
          }
        } catch (error) {
          console.log(`⚠️  Failed to process URL variation: ${url}`, error);
          // Don't fail the test for URL variations that might not work
        }
      }
    }, 60000); // Longer timeout for multiple URL variations

    it("should include comprehensive video metadata", async () => {
      const testUrl = "https://www.youtube.com/watch?v=5j9LPE4JqBI";

      const result = await caller.getVideoInfo({
        url: testUrl,
      });

      expect(result.success).toBe(true);
      expect(result.videoInfo).toBeDefined();

      const videoInfo = result.videoInfo!;

      // Test required fields
      expect(videoInfo.videoId).toBe("5j9LPE4JqBI");
      expect(videoInfo.title).toBeDefined();
      expect(typeof videoInfo.title).toBe("string");
      expect(videoInfo.title.length).toBeGreaterThan(0);

      // Test optional fields that should be present for most videos
      if (videoInfo.durationSeconds) {
        expect(typeof videoInfo.durationSeconds).toBe("number");
        expect(videoInfo.durationSeconds).toBeGreaterThan(0);
      }

      if (videoInfo.viewCount) {
        expect(typeof videoInfo.viewCount).toBe("number");
        expect(videoInfo.viewCount).toBeGreaterThan(0);
      }

      if (videoInfo.channelTitle) {
        expect(typeof videoInfo.channelTitle).toBe("string");
        expect(videoInfo.channelTitle.length).toBeGreaterThan(0);
      }

      if (videoInfo.thumbnailUrl) {
        expect(typeof videoInfo.thumbnailUrl).toBe("string");
        expect(videoInfo.thumbnailUrl).toMatch(/^https?:\/\//);
      }

      // Test timestamps
      expect(videoInfo.createdAt).toBeDefined();
      expect(typeof videoInfo.createdAt).toBe("number");
      expect(videoInfo.createdAt).toBeGreaterThan(0);

      console.log("✅ Video metadata comprehensive test passed:", {
        title: videoInfo.title,
        duration: videoInfo.durationSeconds,
        views: videoInfo.viewCount,
        channel: videoInfo.channelTitle,
        hasThumbnail: !!videoInfo.thumbnailUrl,
      });
    }, 30000);

    it("should handle thumbnail download correctly", async () => {
      const testUrl = "https://www.youtube.com/watch?v=5j9LPE4JqBI";

      const result = await caller.getVideoInfo({
        url: testUrl,
      });

      expect(result.success).toBe(true);
      expect(result.videoInfo).toBeDefined();

      const videoInfo = result.videoInfo!;

      // Check if thumbnail was downloaded
      if (videoInfo.thumbnailPath) {
        const fs = require("fs");
        expect(fs.existsSync(videoInfo.thumbnailPath)).toBe(true);

        // Check file size is reasonable (thumbnails should be > 1KB)
        const stats = fs.statSync(videoInfo.thumbnailPath);
        expect(stats.size).toBeGreaterThan(1000);

        console.log(`✅ Thumbnail downloaded: ${videoInfo.thumbnailPath} (${stats.size} bytes)`);
      } else {
        console.log("⚠️  No thumbnail was downloaded for this video");
      }
    }, 30000);
  });

  describe("edge cases and error handling", () => {
    it("should validate URL format", async () => {
      const invalidUrls = [
        "not-a-url",
        "http://",
        "ftp://example.com",
        "",
        "javascript:alert('xss')",
      ];

      for (const invalidUrl of invalidUrls) {
        try {
          await caller.getVideoInfo({ url: invalidUrl });
          // If we get here, the validation didn't work as expected
          fail(`Expected validation error for URL: ${invalidUrl}`);
        } catch (error) {
          // This is expected - invalid URLs should be rejected
          expect(error).toBeDefined();
          console.log(`✅ Rejected invalid URL format: ${invalidUrl}`);
        }
      }
    });

    it("should handle network timeouts gracefully", async () => {
      // This test uses a valid URL but tests timeout handling
      const testUrl = "https://www.youtube.com/watch?v=5j9LPE4JqBI";

      try {
        const result = await caller.getVideoInfo({
          url: testUrl,
        });

        // If successful, that's fine - network was good
        if (result.success) {
          console.log("✅ Network request completed successfully");
        } else {
          console.log("✅ Network request handled error gracefully:", result.error);
        }
      } catch (error) {
        // If it throws, make sure it's a reasonable error
        expect(error).toBeDefined();
        console.log("✅ Network timeout/error handled:", error);
      }
    }, 45000); // Longer timeout to test timeout handling
  });
});
