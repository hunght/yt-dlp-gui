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
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDatabase("download-router-start");
    await seedTestDatabase(testDb.db);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.cleanup();
    }
  });

  describe("startDownload", () => {
    it("should start a download and wait for completion", async () => {
      const caller = createDownloadTestCaller(testDb);

      // Start the download
      const result = await caller.startDownload({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      });

      expect(result).toMatchObject({
        id: expect.any(String),
        status: "pending",
        videoInfo: null,
      });

      // Verify download was created in database initially
      const initialDownload = await testDb.db
        .select()
        .from(downloads)
        .where(eq(downloads.id, result.id))
        .get();

      expect(initialDownload).toMatchObject({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        status: "pending",
        progress: 0,
        videoId: null,
      });

      // Wait for the background process to complete
      console.log(`Waiting for download ${result.id} to complete...`);
      const finalDownload = await waitForDownloadCompletion(testDb, result.id);

      // Check the final state
      console.log(`Download ${result.id} final status: ${finalDownload.status}`);

      // The download should either complete successfully or fail with a specific error
      expect(finalDownload.status).toMatch(/^(completed|failed)$/);

      if (finalDownload.status === "completed") {
        // If completed, should have file path and size
        expect(finalDownload.filePath).toBeDefined();
        expect(finalDownload.fileSize).toBeGreaterThan(0);
        expect(finalDownload.progress).toBe(100);
      } else if (finalDownload.status === "failed") {
        // If failed, should have error message
        expect(finalDownload.errorMessage).toBeDefined();
        console.log(`Download failed with error: ${finalDownload.errorMessage}`);
      }

      // Should have updated timestamp
      expect(finalDownload.updatedAt).toBeGreaterThan(finalDownload.createdAt);
    }, 60000); // 60 second timeout for this test

    it("should start a download with real data using specified format and output options", async () => {
      // Use real database data instead of seeded test data
      const realDataTestDb = await createTestDatabaseWithRealData("download-router-real-data");
      const caller = createDownloadTestCaller(realDataTestDb);

      try {
        // Start the download with specific format and output options
        // Using "best720p" which maps to "best[height<=720]" - a good balance of quality and compatibility
        const result = await caller.startDownload({
          url: "https://www.youtube.com/watch?v=imdTKPQW9ek",
          format: "best720p", // Using enum value that maps to best[height<=720]
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
          url: "https://www.youtube.com/watch?v=imdTKPQW9ek",
          status: "pending",
          progress: 0,
          format: "best720p",
          videoId: null,
        });

        console.log(`Starting download with real data for video: ${result.id}`);
        console.log(
          `Expected command args: -o /Users/owner/source/youtube-downloader/yt-dlp-gui/downloads/%(title)s.%(ext)s --progress --newline --no-warnings --merge-output-format mp4`
        );

        // Wait for the background process to complete
        console.log(`Waiting for download ${result.id} to complete...`);
        const finalDownload = await waitForDownloadCompletion(realDataTestDb, result.id, 90000); // Longer timeout for real download

        // Check the final state
        console.log(`Download ${result.id} final status: ${finalDownload.status}`);

        // The download should either complete successfully or fail with a specific error
        expect(finalDownload.status).toMatch(/^(completed|failed)$/);

        if (finalDownload.status === "completed") {
          // If completed, should have file path and size
          expect(finalDownload.filePath).toBeDefined();
          expect(finalDownload.fileSize).toBeGreaterThan(0);
          expect(finalDownload.progress).toBe(100);
          console.log(
            `Download completed successfully. File: ${finalDownload.filePath}, Size: ${finalDownload.fileSize} bytes`
          );
        } else if (finalDownload.status === "failed") {
          // If failed, should have error message
          expect(finalDownload.errorMessage).toBeDefined();
          console.log(`Download failed with error: ${finalDownload.errorMessage}`);
        }

        // Should have updated timestamp
        expect(finalDownload.updatedAt).toBeGreaterThan(finalDownload.createdAt);

        // Verify the download is using the correct format and path settings
        if (finalDownload.status === "completed") {
          expect(finalDownload.filePath).toContain(
            "/Users/owner/source/youtube-downloader/yt-dlp-gui/downloads"
          );
          expect(finalDownload.filePath).toMatch(/\.mp4$/); // Should end with .mp4
        }
      } finally {
        // Always cleanup the real data test database
        await realDataTestDb.cleanup();
      }
    }, 120000); // 2 minute timeout for this test with real data
  });
});
