import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { createTestDatabase, seedTestDatabase, type TestDatabase } from "./test-db-setup";
import {
  createYouTubeTestCaller,
  createMockVideoInfo,
  expectVideoExists,
  expectVideoNotExists,
  getTotalVideoCount,
} from "./test-utils";
import { eq } from "drizzle-orm";
import { youtubeVideos } from "../../api/db/schema";

describe("YouTube Router", () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDatabase("youtube-router");
    await seedTestDatabase(testDb.db);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe("getVideos", () => {
    it("should return paginated videos with default parameters", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({});

      expect(result).toHaveProperty("videos");
      expect(result).toHaveProperty("pagination");
      expect(result.videos).toHaveLength(2); // We seeded 2 videos
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.totalCount).toBe(2);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNextPage).toBe(false);
      expect(result.pagination.hasPrevPage).toBe(false);
    });

    it("should return videos with custom pagination", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({
        page: 1,
        limit: 1,
      });

      expect(result.videos).toHaveLength(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(1);
      expect(result.pagination.totalCount).toBe(2);
      expect(result.pagination.totalPages).toBe(2);
      expect(result.pagination.hasNextPage).toBe(true);
      expect(result.pagination.hasPrevPage).toBe(false);
    });

    it("should filter videos by search term", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({
        search: "Test Video 1",
      });

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0].title).toBe("Test Video 1");
      expect(result.pagination.totalCount).toBe(1);
    });

    it("should filter videos by channel ID", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({
        channelId: "test-channel-1",
      });

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0].channelId).toBe("test-channel-1");
      expect(result.pagination.totalCount).toBe(1);
    });

    it("should filter videos by both search and channel", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({
        search: "Test Video 1",
        channelId: "test-channel-1",
      });

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0].title).toBe("Test Video 1");
      expect(result.videos[0].channelId).toBe("test-channel-1");
      expect(result.pagination.totalCount).toBe(1);
    });

    it("should sort videos by different fields", async () => {
      const caller = createYouTubeTestCaller(testDb);

      // Test sorting by title ascending
      const resultAsc = await caller.getVideos({
        sortBy: "title",
        sortOrder: "asc",
      });

      expect(resultAsc.videos[0].title).toBe("Test Video 1");
      expect(resultAsc.videos[1].title).toBe("Test Video 2");

      // Test sorting by title descending
      const resultDesc = await caller.getVideos({
        sortBy: "title",
        sortOrder: "desc",
      });

      expect(resultDesc.videos[0].title).toBe("Test Video 2");
      expect(resultDesc.videos[1].title).toBe("Test Video 1");
    });

    it("should sort videos by view count", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({
        sortBy: "viewCount",
        sortOrder: "desc",
      });

      expect(result.videos[0].viewCount).toBe(1000000);
      expect(result.videos[1].viewCount).toBe(500000);
    });

    it("should sort videos by like count", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({
        sortBy: "likeCount",
        sortOrder: "desc",
      });

      expect(result.videos[0].likeCount).toBe(50000);
      expect(result.videos[1].likeCount).toBe(25000);
    });

    it("should sort videos by published date", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({
        sortBy: "publishedAt",
        sortOrder: "desc",
      });

      // First video should be more recent (1 day ago vs 2 days ago)
      expect(result.videos[0].title).toBe("Test Video 1");
      expect(result.videos[1].title).toBe("Test Video 2");
    });

    it("should handle empty results", async () => {
      // Clear the database
      await testDb.db.delete(youtubeVideos);

      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({});

      expect(result.videos).toHaveLength(0);
      expect(result.pagination.totalCount).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it("should handle search with no matches", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({
        search: "non-existent video",
      });

      expect(result.videos).toHaveLength(0);
      expect(result.pagination.totalCount).toBe(0);
    });
  });

  describe("getVideoById", () => {
    it("should return video by ID", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideoById({ id: "test-video-1" });

      expect(result).not.toBeNull();
      expect(result?.id).toBe("test-video-1");
      expect(result?.title).toBe("Test Video 1");
      expect(result?.videoId).toBe("dQw4w9WgXcQ");
    });

    it("should return null for non-existent video", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideoById({ id: "non-existent" });

      expect(result).toBeNull();
    });
  });

  describe("getVideosByChannel", () => {
    it("should return videos for a specific channel", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideosByChannel({
        channelId: "test-channel-1",
        limit: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].channelId).toBe("test-channel-1");
      expect(result[0].title).toBe("Test Video 1");
    });

    it("should return empty array for non-existent channel", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideosByChannel({
        channelId: "non-existent-channel",
        limit: 10,
      });

      expect(result).toHaveLength(0);
    });

    it("should respect limit parameter", async () => {
      // Add more videos to the same channel
      await testDb.db.insert(youtubeVideos).values([
        createMockVideoInfo({
          id: "test-video-3",
          videoId: "test-video-3-id",
          title: "Test Video 3",
          channelId: "test-channel-1",
          channelTitle: "Test Channel 1",
        }),
        createMockVideoInfo({
          id: "test-video-4",
          videoId: "test-video-4-id",
          title: "Test Video 4",
          channelId: "test-channel-1",
          channelTitle: "Test Channel 1",
        }),
      ]);

      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideosByChannel({
        channelId: "test-channel-1",
        limit: 2,
      });

      expect(result).toHaveLength(2);
      expect(result.every((video) => video.channelId === "test-channel-1")).toBe(true);
    });

    it("should order videos by published date descending", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideosByChannel({
        channelId: "test-channel-1",
        limit: 10,
      });

      expect(result).toHaveLength(1);
      // Should be ordered by publishedAt desc (most recent first)
      expect(result[0].title).toBe("Test Video 1");
    });
  });

  describe("getVideoStats", () => {
    it("should return correct video statistics", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideoStats();

      expect(result).toHaveProperty("totalVideos", 2);
      expect(result).toHaveProperty("totalViews", 1500000); // 1000000 + 500000
      expect(result).toHaveProperty("totalLikes", 75000); // 50000 + 25000
      expect(result).toHaveProperty("totalDuration", 392); // 212 + 180
      expect(result).toHaveProperty("uniqueChannels", 2);
    });

    it("should return zero stats for empty database", async () => {
      // Clear the database
      await testDb.db.delete(youtubeVideos);

      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideoStats();

      expect(result).toHaveProperty("totalVideos", 0);
      expect(result).toHaveProperty("totalViews", 0);
      expect(result).toHaveProperty("totalLikes", 0);
      expect(result).toHaveProperty("totalDuration", 0);
      expect(result).toHaveProperty("uniqueChannels", 0);
    });

    it("should handle null values in statistics", async () => {
      // Add a video with null values
      await testDb.db.insert(youtubeVideos).values(
        createMockVideoInfo({
          id: "test-video-null",
          videoId: "test-video-null-id",
          title: "Test Video with Null Values",
          viewCount: null,
          likeCount: null,
          durationSeconds: null,
        })
      );

      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideoStats();

      expect(result).toHaveProperty("totalVideos", 3);
      expect(result).toHaveProperty("totalViews", 1500000); // Should not include null values
      expect(result).toHaveProperty("totalLikes", 75000); // Should not include null values
      expect(result).toHaveProperty("totalDuration", 392); // Should not include null values
      expect(result).toHaveProperty("uniqueChannels", 3);
    });
  });

  describe("getChannels", () => {
    it("should return unique channels with video counts", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getChannels({ page: 1, limit: 10 });

      expect(result.channels).toHaveLength(2);

      // Should be ordered by video count descending
      expect(result.channels[0].channelId).toBe("test-channel-1");
      expect(result.channels[0].channelTitle).toBe("Test Channel 1");
      expect(result.channels[0].videoCount).toBe(1);

      expect(result.channels[1].channelId).toBe("test-channel-2");
      expect(result.channels[1].channelTitle).toBe("Test Channel 2");
      expect(result.channels[1].videoCount).toBe(1);
    });

    it("should return channels ordered by video count", async () => {
      // Add more videos to test-channel-1
      await testDb.db.insert(youtubeVideos).values([
        createMockVideoInfo({
          id: "test-video-3",
          videoId: "test-video-3-id",
          title: "Test Video 3",
          channelId: "test-channel-1",
          channelTitle: "Test Channel 1",
        }),
        createMockVideoInfo({
          id: "test-video-4",
          videoId: "test-video-4-id",
          title: "Test Video 4",
          channelId: "test-channel-1",
          channelTitle: "Test Channel 1",
        }),
      ]);

      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getChannels({ page: 1, limit: 10 });

      expect(result.channels).toHaveLength(2);

      // test-channel-1 should be first (3 videos)
      expect(result.channels[0].channelId).toBe("test-channel-1");
      expect(result.channels[0].videoCount).toBe(3);

      // test-channel-2 should be second (1 video)
      expect(result.channels[1].channelId).toBe("test-channel-2");
      expect(result.channels[1].videoCount).toBe(1);
    });

    it("should return empty array for empty database", async () => {
      // Clear the database
      await testDb.db.delete(youtubeVideos);

      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getChannels({ page: 1, limit: 10 });

      expect(result.channels).toHaveLength(0);
    });

    it("should handle channels with null titles", async () => {
      // Add a video with null channel title
      await testDb.db.insert(youtubeVideos).values(
        createMockVideoInfo({
          id: "test-video-null-channel",
          videoId: "test-video-null-channel-id",
          title: "Test Video with Null Channel Title",
          channelId: "test-channel-null",
          channelTitle: null,
        })
      );

      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getChannels({ page: 1, limit: 10 });

      expect(result.channels).toHaveLength(3);

      // Find the channel with null title
      const nullChannel = result.channels.find(
        (channel) => channel.channelId === "test-channel-null"
      );
      expect(nullChannel).toBeDefined();
      expect(nullChannel?.channelTitle).toBeNull();
      expect(nullChannel?.videoCount).toBe(1);
    });

    it("should handle pagination for channels", async () => {
      // Add more channels to test pagination
      await testDb.db.insert(youtubeVideos).values([
        createMockVideoInfo({
          id: "test-video-3",
          videoId: "test-video-3-id",
          title: "Test Video 3",
          channelId: "test-channel-3",
          channelTitle: "Test Channel 3",
        }),
        createMockVideoInfo({
          id: "test-video-4",
          videoId: "test-video-4-id",
          title: "Test Video 4",
          channelId: "test-channel-4",
          channelTitle: "Test Channel 4",
        }),
      ]);

      const caller = createYouTubeTestCaller(testDb);

      // Test first page
      const result1 = await caller.getChannels({ page: 1, limit: 2 });
      expect(result1.channels).toHaveLength(2);
      expect(result1.pagination.page).toBe(1);
      expect(result1.pagination.limit).toBe(2);
      expect(result1.pagination.totalCount).toBe(4);
      expect(result1.pagination.totalPages).toBe(2);
      expect(result1.pagination.hasNextPage).toBe(true);
      expect(result1.pagination.hasPrevPage).toBe(false);

      // Test second page
      const result2 = await caller.getChannels({ page: 2, limit: 2 });
      expect(result2.channels).toHaveLength(2);
      expect(result2.pagination.page).toBe(2);
      expect(result2.pagination.hasNextPage).toBe(false);
      expect(result2.pagination.hasPrevPage).toBe(true);
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle invalid pagination parameters gracefully", async () => {
      const caller = createYouTubeTestCaller(testDb);

      // Test with very large page number
      const result = await caller.getVideos({ page: 999, limit: 10 });
      expect(result.videos).toHaveLength(0);
      expect(result.pagination.page).toBe(999);
      expect(result.pagination.totalCount).toBe(2);
    });

    it("should handle search with special characters", async () => {
      const caller = createYouTubeTestCaller(testDb);

      // Test search with special characters that won't match any seeded data
      const result = await caller.getVideos({
        search: "xyz@#$%^&*()",
      });

      expect(result.videos).toHaveLength(0); // Should not match due to special characters
    });

    it("should handle case-insensitive search", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({
        search: "test video 1",
      });

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0].title).toBe("Test Video 1");
    });

    it("should handle search in description", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({
        search: "test video description",
      });

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0].title).toBe("Test Video 1");
    });

    it("should handle search in channel title", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({
        search: "Test Channel 1",
      });

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0].channelTitle).toBe("Test Channel 1");
    });

    it("should handle sorting with null values", async () => {
      // Add a video with null view count
      await testDb.db.insert(youtubeVideos).values(
        createMockVideoInfo({
          id: "test-video-null-views",
          videoId: "test-video-null-views-id",
          title: "Test Video with Null Views",
          viewCount: null,
        })
      );

      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({
        sortBy: "viewCount",
        sortOrder: "desc",
      });

      // Should handle null values gracefully
      expect(result.videos).toHaveLength(3);
      // The video with null view count should be at the end
      expect(result.videos[2].viewCount).toBeNull();
    });

    it("should handle default sorting when no sortBy is specified", async () => {
      const caller = createYouTubeTestCaller(testDb);

      const result = await caller.getVideos({});

      expect(result.videos).toHaveLength(2);
      // Should be sorted by createdAt desc by default
      expect(result.videos[0].id).toBe("test-video-1");
      expect(result.videos[1].id).toBe("test-video-2");
    });

    it("should handle limit parameter edge cases", async () => {
      const caller = createYouTubeTestCaller(testDb);

      // Test with limit of 1
      const result1 = await caller.getVideos({ limit: 1 });
      expect(result1.videos).toHaveLength(1);
      expect(result1.pagination.limit).toBe(1);

      // Test with limit of 100 (max allowed)
      const result2 = await caller.getVideos({ limit: 100 });
      expect(result2.videos).toHaveLength(2);
      expect(result2.pagination.limit).toBe(100);
    });
  });
});
