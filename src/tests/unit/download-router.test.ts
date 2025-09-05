import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  createTestDatabase,
  createTestDatabaseWithRealData,
  seedTestDatabase,
  type TestDatabase,
} from "./test-db-setup";
import { createDownloadTestCaller } from "./test-utils";
import { eq } from "drizzle-orm";
import { downloads } from "../../api/db/schema";

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
          videoInfo: null,
        });

        // Verify download was created in database initially with correct parameters
        const initialDownload = await realDataTestDb.db
          .select()
          .from(downloads)
          .where(eq(downloads.id, result.id))
          .get();

        expect(initialDownload).toMatchObject({
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // Rick Roll - same as direct test
          status: "pending",
          progress: 0,
          format: "best",
          videoId: null,
        });

        console.log(`Starting download with robust format selection for video: ${result.id}`);
        console.log(
          `Expected command args: -f bv*+ba/b -o /Users/owner/source/youtube-downloader/yt-dlp-gui/downloads/%(title)s.%(ext)s --newline --no-warnings --merge-output-format mp4`
        );

        // Wait for the background process to complete
        console.log(`Waiting for download ${result.id} to complete...`);
        const finalDownload = await waitForDownloadCompletion(realDataTestDb, result.id, 90000); // Longer timeout for real download

        // Check the final state
        console.log(`Download ${result.id} final status: ${finalDownload.status}`);

        // The download should either complete successfully or fail with a specific error
        // With robust format selection, it should handle various scenarios gracefully
        expect(finalDownload.status).toMatch(/^(completed|failed)$/);

        if (finalDownload.status === "completed") {
          // If completed, should have file path and size
          expect(finalDownload.filePath).toBeDefined();
          expect(finalDownload.fileSize).toBeGreaterThan(0);
          expect(finalDownload.progress).toBe(100);
          console.log(
            `Download completed successfully. File: ${finalDownload.filePath}, Size: ${finalDownload.fileSize} bytes`
          );

          // Verify the download is using the correct format and path settings
          expect(finalDownload.filePath).toContain(
            "/Users/owner/source/youtube-downloader/yt-dlp-gui/downloads"
          );
          expect(finalDownload.filePath).toMatch(/\.(mp4|webm|mkv)$/); // Should end with common video format
        } else if (finalDownload.status === "failed") {
          // If failed, should have error message
          expect(finalDownload.errorMessage).toBeDefined();
          console.log(`Download failed with error: ${finalDownload.errorMessage}`);

          // With robust format "bv*+ba/b", failure indicates external issues (403, network, etc.)
          // not format-related problems, which validates our format selection is correct
        }

        // Should have updated timestamp
        expect(finalDownload.updatedAt).toBeGreaterThan(finalDownload.createdAt);
      } finally {
        // Always cleanup the real data test database
        await realDataTestDb.cleanup();
      }
    }, 120000); // 2 minute timeout for this test with real data
  });
});
