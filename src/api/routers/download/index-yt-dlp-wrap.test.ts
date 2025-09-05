import { describe, test, expect } from "@jest/globals";
const YTDlpWrapModule = require("yt-dlp-wrap");
const YTDlpWrap = YTDlpWrapModule.default;

describe("yt-dlp-wrap Integration Tests", () => {
  test("should get video info for a valid YouTube URL", async () => {
    const ytDlpWrap = new YTDlpWrap();
    const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; // Rick Roll - short video

    try {
      // Use execPromise with --dump-json to get video info without format restrictions
      const output = await ytDlpWrap.execPromise([testUrl, "--dump-json"]);
      const videoInfo = JSON.parse(output);

      expect(videoInfo).toBeDefined();
      expect(videoInfo.title).toBeDefined();
      expect(typeof videoInfo.title).toBe("string");
      expect(videoInfo.title.length).toBeGreaterThan(0);

      console.log("Video Info:", {
        title: videoInfo.title,
        duration: videoInfo.duration,
        uploader: videoInfo.uploader,
        view_count: videoInfo.view_count,
      });
    } catch (error) {
      console.error("Failed to get video info:", error);
      throw error;
    }
  }, 30000); // 30 second timeout

  test("should list available formats for a YouTube URL", async () => {
    const ytDlpWrap = new YTDlpWrap();
    const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    try {
      // Use execPromise for Promise-based execution
      const output = await ytDlpWrap.execPromise([testUrl, "--list-formats"]);

      expect(output).toBeDefined();
      expect(typeof output).toBe("string");
      expect(output.length).toBeGreaterThan(0);

      // Check if result contains format information
      expect(output).toContain("ID  EXT   RESOLUTION");
      expect(output).toContain("Available formats");
      expect(output).toContain("mp4");

      console.log("Available formats (first 500 chars):", output.substring(0, 500));
    } catch (error) {
      console.error("Failed to list formats:", error);
      throw error;
    }
  }, 30000);

  test("should handle invalid URL gracefully", async () => {
    const ytDlpWrap = new YTDlpWrap();
    const invalidUrl = "https://invalid-url-that-does-not-exist.com";

    try {
      await ytDlpWrap.getVideoInfo(invalidUrl);
      // If we get here, the test should fail
      expect(true).toBe(false);
    } catch (error) {
      // This is expected - invalid URL should throw an error
      expect(error).toBeDefined();
      console.log("Expected error for invalid URL:", error);
    }
  }, 15000);

  test("should download a short video with working format", async () => {
    const ytDlpWrap = new YTDlpWrap();
    const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const outputPath = "./test-download.%(ext)s";

    try {
      // Use execPromise for Promise-based download with a specific format ID
      const downloadArgs = [
        testUrl,
        "-f",
        "139", // Use format ID 139 (m4a audio only) which should always be available
        "-o",
        outputPath,
        "--no-warnings",
      ];

      console.log("Starting download with args:", downloadArgs);

      const output = await ytDlpWrap.execPromise(downloadArgs);

      console.log("Download completed successfully");
      console.log("Download output:", output);
      expect(output).toBeDefined();
    } catch (error) {
      console.error("Download failed:", error);
      throw error;
    }
  }, 60000); // 60 second timeout

  test("should download short video directly with mp4 format", async () => {
    const ytDlpWrap = new YTDlpWrap();
    const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; // Rick Roll - reliable short video
    const outputPath =
      "/Users/owner/source/youtube-downloader/yt-dlp-gui/downloads/test-direct-download.%(ext)s";

    try {
      // Clean up any existing test file first
      const fs = require("fs");
      const path = require("path");
      const possibleFiles = [
        "/Users/owner/source/youtube-downloader/yt-dlp-gui/downloads/test-direct-download.mp4",
        "/Users/owner/source/youtube-downloader/yt-dlp-gui/downloads/test-direct-download.webm",
        "/Users/owner/source/youtube-downloader/yt-dlp-gui/downloads/test-direct-download.mkv",
      ];

      for (const filePath of possibleFiles) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Removed existing test file: ${filePath}`);
          }
        } catch (e) {
          console.log(
            `Could not remove ${filePath}:`,
            e instanceof Error ? e.message : "Unknown error"
          );
        }
      }

      // Use robust format selection with mp4 output
      const downloadArgs = [
        testUrl,
        "-f",
        "bv*+ba/b", // Best video + best audio, fallback to best combined
        "-o",
        outputPath,
        "--merge-output-format",
        "mp4", // Force mp4 output
        "--progress",
        "--newline",
        "--no-warnings",
      ];

      console.log("Starting direct mp4 download with args:", downloadArgs.join(" "));
      console.log(
        `Full command: yt-dlp ${downloadArgs.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ")}`
      );

      const output = await ytDlpWrap.execPromise(downloadArgs);

      console.log("Direct mp4 download completed successfully");
      console.log("Download output:", output);
      expect(output).toBeDefined();

      // Verify the file was created
      const expectedFile =
        "/Users/owner/source/youtube-downloader/yt-dlp-gui/downloads/test-direct-download.mp4";
      if (fs.existsSync(expectedFile)) {
        const stats = fs.statSync(expectedFile);
        console.log(`✅ MP4 file created successfully: ${expectedFile}`);
        console.log(`File size: ${stats.size} bytes`);
        expect(stats.size).toBeGreaterThan(0);
      } else {
        console.log("❌ Expected MP4 file not found");
        // List what files were actually created
        const downloadDir = "/Users/owner/source/youtube-downloader/yt-dlp-gui/downloads";
        const files = fs
          .readdirSync(downloadDir)
          .filter((f: string) => f.includes("test-direct-download"));
        console.log("Files created:", files);
      }
    } catch (error) {
      console.error("Direct mp4 download failed:", error);
      throw error;
    }
  }, 90000); // 90 second timeout for video download

  test("should find working format for Khan Academy video", async () => {
    const ytDlpWrap = new YTDlpWrap();
    const testUrl = "https://www.youtube.com/watch?v=OzeHAwjaG60"; // The failing video from the logs

    try {
      // First, get available formats
      console.log("Getting available formats for Khan Academy video...");
      const formatsResult = await ytDlpWrap.execPromise([testUrl, "--list-formats"]);
      console.log("Available formats:", formatsResult.substring(0, 2000));

      // Test different format options to find one that works
      const formatOptions = [
        "best[height<=720]/best[height<=480]/best[height<=360]/best",
        "best[height<=480]/best[height<=360]/best",
        "best[height<=360]/best",
        "best",
        "worst",
        "bestaudio",
        "bestvideo+bestaudio",
        "mp4",
        "webm",
      ];

      for (const formatOption of formatOptions) {
        try {
          console.log(`\nTesting format: ${formatOption}`);

          // Test if this format works by trying to get video info with it
          const testArgs = [testUrl, "-f", formatOption, "--dump-json"];
          const result = await ytDlpWrap.execPromise(testArgs);

          console.log(`✅ Format "${formatOption}" works!`);
          const videoInfo = JSON.parse(result);
          console.log(`Title: ${videoInfo.title}`);
          console.log(`Duration: ${videoInfo.duration}s`);

          // If we get here, this format works
          expect(true).toBe(true);
          return;
        } catch (error) {
          console.log(`❌ Format "${formatOption}" failed:`, error);
        }
      }

      // If we get here, none of the formats worked
      throw new Error("No working format found for this video");
    } catch (error) {
      console.error("Failed to test formats:", error);
      throw error;
    }
  }, 120000); // 2 minute timeout
});
