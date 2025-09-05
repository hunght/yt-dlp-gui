import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  createTestDatabase,
  createTestDatabaseWithRealData,
  seedTestDatabase,
  type TestDatabase,
} from "../../../tests/unit/test-db-setup";
import { createDownloadTestCaller } from "../../../tests/unit/test-utils";
import { eq } from "drizzle-orm";
import { downloads } from "../../db/schema";

// Helper function to wait for a condition to be true
const waitForCondition = async (
  condition: () => Promise<boolean>,
  timeout = 30000, // 30 seconds
  interval = 1000 // 1 second
): Promise<void> => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
};

// Helper function to wait for download to complete or fail
const waitForDownloadCompletion = async (
  testDb: TestDatabase,
  downloadId: string,
  timeout = 30000
): Promise<any> => {
  await waitForCondition(async () => {
    const download = await testDb.db
      .select()
      .from(downloads)
      .where(eq(downloads.id, downloadId))
      .get();

    return download
      ? download.status === "completed" ||
          download.status === "failed" ||
          download.status === "cancelled"
      : false;
  }, timeout);

  // Return the final download state
  return await testDb.db.select().from(downloads).where(eq(downloads.id, downloadId)).get();
};

describe("Download Router - startDownload", () => {
  describe("startDownload", () => {
    it("should handle download with robust format selection and proper error handling", async () => {
      // Use real database data instead of seeded test data
      const realDataTestDb = await createTestDatabaseWithRealData("download-router-real-data");
      const caller = createDownloadTestCaller(realDataTestDb);

      try {
        // Clean up any existing downloaded file to ensure fresh test
        const fs = require("fs");
        const path = require("path");
        const downloadsDir = "/Users/owner/source/youtube-downloader/yt-dlp-gui/downloads";
        const possibleFiles = [
          "Rick Astley - Never Gonna Give You Up (Official Video).mp4",
          "Rick Astley - Never Gonna Give You Up (Official Video).webm",
          "Rick Astley - Never Gonna Give You Up (Official Video).mkv",
          "test-direct-download.mp4", // Clean up from direct test too
        ];

        for (const fileName of possibleFiles) {
          const filePath = path.join(downloadsDir, fileName);
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`Removed existing file: ${fileName}`);
            }
          } catch (e) {
            console.log(
              `Could not remove ${fileName}:`,
              e instanceof Error ? e.message : "Unknown error"
            );
          }
        }

        // Start the download with robust format selection
        // Using the SAME video URL that works in the direct test!
        const result = await caller.startDownload({
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // Rick Roll - same as direct test
          format: "best", // Using enum value that maps to bv*+ba/b with robust fallbacks
          outputPath: "/Users/owner/source/youtube-downloader/yt-dlp-gui/downloads",
          outputFilename: "%(title)s.%(ext)s",
          outputFormat: "mp4",
        });

        expect(result).toMatchObject({
          id: expect.any(String),
          status: "pending",
          videoInfo: expect.objectContaining({
            videoId: "dQw4w9WgXcQ",
            title: expect.stringContaining("Rick Astley"),
          }),
        });

        // Verify download was completed successfully with correct parameters
        const completedDownload = await realDataTestDb.db
          .select()
          .from(downloads)
          .where(eq(downloads.id, result.id))
          .get();

        expect(completedDownload).toBeDefined();
        expect(completedDownload).toMatchObject({
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // Rick Roll - same as direct test
          status: "completed", // Should be completed since download runs synchronously now
          progress: 100, // Should be 100% complete
          videoId: "dQw4w9WgXcQ", // Should have the actual video ID, not null
        });

        // Verify the download has expected properties for a completed download
        expect(completedDownload!.filePath).toBeDefined();
        expect(completedDownload!.fileSize).toBeGreaterThan(0);
        expect(completedDownload!.updatedAt).toBeGreaterThan(completedDownload!.createdAt);

        // Test completed successfully! We've verified that:
        // 1. Video info is fetched and returned immediately
        // 2. Download record is created with proper videoId (not null)
        // 3. Download completes synchronously in main process
        // 4. The co-located test structure works correctly
        console.log("✅ Test completed successfully - video info properly fetched and stored");
        console.log("✅ Download completed synchronously in main process");
        console.log(
          `✅ Downloaded file: ${completedDownload!.filePath} (${completedDownload!.fileSize} bytes)`
        );

        // Verify the file is in the downloads folder
        expect(completedDownload!.filePath).toContain("/downloads/");
      } catch (error) {
        console.error("Test failed:", error);
        throw error;
      } finally {
        // Always cleanup the real data test database
        await realDataTestDb.cleanup();
      }
    }, 120000); // 2 minute timeout for this test with real data
  });
});
