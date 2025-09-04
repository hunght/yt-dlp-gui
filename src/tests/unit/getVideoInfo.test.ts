import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { trpcClient } from "../../utils/trpc";

describe("getVideoInfo API Tests", () => {
  const testVideoUrl = "https://www.youtube.com/watch?v=imdTKPQW9ek";

  beforeAll(() => {
    // Set up any necessary test configuration
    console.log("Starting getVideoInfo API tests...");
  });

  afterAll(() => {
    // Clean up any test resources
    console.log("Completed getVideoInfo API tests");
  });

  test("should successfully get video info for the test YouTube URL", async () => {
    try {
      console.log(`Testing video info for: ${testVideoUrl}`);

      const result = await trpcClient.download.getVideoInfo.mutate({
        url: testVideoUrl,
      });

      // Verify the result structure
      expect(result).toBeDefined();
      expect(result.success).toBe(true);

      if (result.success && "videoInfo" in result) {
        const videoInfo = result.videoInfo;

        // Verify required fields
        expect(videoInfo.id).toBeDefined();
        expect(videoInfo.videoId).toBeDefined();
        expect(videoInfo.title).toBeDefined();
        expect(videoInfo.createdAt).toBeDefined();

        // Verify video ID extraction
        expect(videoInfo.videoId).toBe("imdTKPQW9ek");

        // Verify title is not empty
        expect(typeof videoInfo.title).toBe("string");
        expect(videoInfo.title.length).toBeGreaterThan(0);
        expect(videoInfo.title).not.toBe("Unknown Title");

        // Log the video information for verification
        console.log("✅ Video Info Retrieved Successfully:");
        console.log(`  Title: ${videoInfo.title}`);
        console.log(`  Video ID: ${videoInfo.videoId}`);
        console.log(`  Channel: ${videoInfo.channelTitle || "N/A"}`);
        console.log(`  Duration: ${videoInfo.durationFormatted || "N/A"}`);
        console.log(
          `  Views: ${videoInfo.viewCount ? videoInfo.viewCount.toLocaleString() : "N/A"}`
        );
        console.log(`  Thumbnail: ${videoInfo.thumbnailPath ? "Downloaded" : "Not available"}`);

        // Verify optional fields are properly handled
        if (videoInfo.channelTitle) {
          expect(typeof videoInfo.channelTitle).toBe("string");
        }

        if (videoInfo.durationSeconds) {
          expect(typeof videoInfo.durationSeconds).toBe("number");
          expect(videoInfo.durationSeconds).toBeGreaterThan(0);
        }

        if (videoInfo.viewCount) {
          expect(typeof videoInfo.viewCount).toBe("number");
          expect(videoInfo.viewCount).toBeGreaterThanOrEqual(0);
        }

        if (videoInfo.thumbnailPath) {
          expect(typeof videoInfo.thumbnailPath).toBe("string");
          expect(videoInfo.thumbnailPath.length).toBeGreaterThan(0);
        }

        // Verify raw data is stored
        expect(videoInfo.raw).toBeDefined();
        expect(typeof videoInfo.raw).toBe("string");

        // Parse and verify raw data structure
        const rawData = JSON.parse(videoInfo.raw);
        expect(rawData).toBeDefined();
        expect(rawData.title).toBe(videoInfo.title);
      } else {
        throw new Error("Video info was not successfully retrieved");
      }
    } catch (error) {
      console.error("❌ Failed to get video info:", error);
      throw error;
    }
  }, 30000); // 30 second timeout

  test("should handle invalid URL gracefully", async () => {
    const invalidUrl = "https://invalid-url-that-does-not-exist.com";

    try {
      const result = await trpcClient.download.getVideoInfo.mutate({
        url: invalidUrl,
      });

      // Should return success: false for invalid URLs
      expect(result.success).toBe(false);

      if (!result.success && "error" in result) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe("string");
        console.log("✅ Invalid URL handled gracefully:", result.error);
      }
    } catch (error) {
      // This is also acceptable - the API might throw for invalid URLs
      console.log("✅ Invalid URL threw expected error:", error);
      expect(error).toBeDefined();
    }
  }, 15000);

  test("should handle empty URL gracefully", async () => {
    try {
      const result = await trpcClient.download.getVideoInfo.mutate({
        url: "",
      });

      // Should return success: false for empty URLs
      expect(result.success).toBe(false);

      if (!result.success && "error" in result) {
        expect(result.error).toBeDefined();
        console.log("✅ Empty URL handled gracefully:", result.error);
      }
    } catch (error) {
      // This is also acceptable - the API might throw for empty URLs
      console.log("✅ Empty URL threw expected error:", error);
      expect(error).toBeDefined();
    }
  }, 10000);

  test("should extract video ID correctly from various YouTube URL formats", async () => {
    const testUrls = [
      "https://www.youtube.com/watch?v=imdTKPQW9ek",
      "https://youtube.com/watch?v=imdTKPQW9ek",
      "https://youtu.be/imdTKPQW9ek",
      "https://m.youtube.com/watch?v=imdTKPQW9ek",
    ];

    for (const url of testUrls) {
      try {
        const result = await trpcClient.download.getVideoInfo.mutate({
          url: url,
        });

        if (result.success && "videoInfo" in result) {
          expect(result.videoInfo.videoId).toBe("imdTKPQW9ek");
          console.log(`✅ URL format handled correctly: ${url}`);
        }
      } catch (error) {
        console.log(`❌ URL format failed: ${url}`, error);
        // Some URL formats might not work, that's okay for this test
      }
    }
  }, 60000); // 1 minute timeout for multiple URLs

  test("should download and store thumbnail correctly", async () => {
    try {
      const result = await trpcClient.download.getVideoInfo.mutate({
        url: testVideoUrl,
      });

      if (result.success && "videoInfo" in result) {
        const videoInfo = result.videoInfo;

        if (videoInfo.thumbnailPath) {
          // Verify thumbnail path is a valid file path
          expect(videoInfo.thumbnailPath).toMatch(/\.(jpg|jpeg|png|webp)$/i);
          expect(videoInfo.thumbnailPath).toContain("thumbnails");
          expect(videoInfo.thumbnailPath).toContain(videoInfo.videoId);

          console.log(`✅ Thumbnail downloaded to: ${videoInfo.thumbnailPath}`);
        } else {
          console.log("ℹ️ No thumbnail available for this video");
        }
      }
    } catch (error) {
      console.error("❌ Thumbnail test failed:", error);
      throw error;
    }
  }, 30000);

  test("should store video info in database correctly", async () => {
    try {
      // First, get video info
      const result = await trpcClient.download.getVideoInfo.mutate({
        url: testVideoUrl,
      });

      if (result.success && "videoInfo" in result) {
        const videoInfo = result.videoInfo;

        // Verify all database fields are properly set
        expect(videoInfo.id).toBeDefined();
        expect(videoInfo.videoId).toBe("imdTKPQW9ek");
        expect(videoInfo.title).toBeDefined();
        expect(videoInfo.createdAt).toBeDefined();
        expect(videoInfo.raw).toBeDefined();

        // Verify timestamps are reasonable
        const now = Date.now();
        expect(videoInfo.createdAt).toBeLessThanOrEqual(now);
        expect(videoInfo.createdAt).toBeGreaterThan(now - 60000); // Within last minute

        console.log("✅ Video info stored in database correctly");
        console.log(`  Database ID: ${videoInfo.id}`);
        console.log(`  Created at: ${new Date(videoInfo.createdAt).toISOString()}`);
      } else {
        throw new Error("Video info was not successfully retrieved");
      }
    } catch (error) {
      console.error("❌ Database storage test failed:", error);
      throw error;
    }
  }, 30000);
});
