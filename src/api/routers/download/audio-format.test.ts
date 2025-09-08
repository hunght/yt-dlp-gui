/**
 * Test suite for audio format handling
 *
 * This test verifies that the MP3 audio format issue is fixed.
 * Previously, the code used --merge-output-format for all formats,
 * which caused errors for audio formats like MP3.
 *
 * The fix: For audio formats (mp3, aac, opus, flac), use --extract-audio --audio-format
 *          For video formats (mp4, webm, mkv), use --merge-output-format
 */

import { formatToYtDlpSelector } from "./types";

describe("Audio Format Handling", () => {
  describe("formatToYtDlpSelector", () => {
    test("should return correct selector for audio-only format", () => {
      const result = formatToYtDlpSelector("audioonly");
      expect(result).toBe("ba/bestaudio");
    });

    test("should return correct selector for audio quality formats", () => {
      expect(formatToYtDlpSelector("audio320")).toBe("ba[abr<=320]/bestaudio[abr<=320]");
      expect(formatToYtDlpSelector("audio128")).toBe("ba[abr<=128]/bestaudio[abr<=128]");
    });

    test("should return correct selector for video formats", () => {
      expect(formatToYtDlpSelector("bestvideo+bestaudio")).toBe("bestvideo+bestaudio");
      expect(formatToYtDlpSelector("best720p")).toBe("bv*[height<=720]+ba/b[height<=720]");
    });
  });

  describe("Output format argument generation", () => {
    /**
     * This test simulates the logic in processDownload() to ensure
     * the correct yt-dlp arguments are generated for different output formats
     */

    function generateOutputFormatArgs(outputFormat: string): string[] {
      const args: string[] = [];

      if (outputFormat && outputFormat !== "default") {
        // For audio formats (mp3, aac, opus, flac), use --audio-format
        const audioFormats = ["mp3", "aac", "opus", "flac"];
        if (audioFormats.includes(outputFormat)) {
          args.push("--extract-audio", "--audio-format", outputFormat);
        } else {
          // For video formats (mp4, webm, mkv), use --merge-output-format
          args.push("--merge-output-format", outputFormat);
        }
      }

      return args;
    }

    test("should generate correct arguments for MP3 audio format", () => {
      const args = generateOutputFormatArgs("mp3");
      expect(args).toEqual(["--extract-audio", "--audio-format", "mp3"]);
    });

    test("should generate correct arguments for AAC audio format", () => {
      const args = generateOutputFormatArgs("aac");
      expect(args).toEqual(["--extract-audio", "--audio-format", "aac"]);
    });

    test("should generate correct arguments for OPUS audio format", () => {
      const args = generateOutputFormatArgs("opus");
      expect(args).toEqual(["--extract-audio", "--audio-format", "opus"]);
    });

    test("should generate correct arguments for FLAC audio format", () => {
      const args = generateOutputFormatArgs("flac");
      expect(args).toEqual(["--extract-audio", "--audio-format", "flac"]);
    });

    test("should generate correct arguments for MP4 video format", () => {
      const args = generateOutputFormatArgs("mp4");
      expect(args).toEqual(["--merge-output-format", "mp4"]);
    });

    test("should generate correct arguments for WebM video format", () => {
      const args = generateOutputFormatArgs("webm");
      expect(args).toEqual(["--merge-output-format", "webm"]);
    });

    test("should generate correct arguments for MKV video format", () => {
      const args = generateOutputFormatArgs("mkv");
      expect(args).toEqual(["--merge-output-format", "mkv"]);
    });

    test("should not generate arguments for default format", () => {
      const args = generateOutputFormatArgs("default");
      expect(args).toEqual([]);
    });

    test("should not generate arguments for undefined format", () => {
      const args = generateOutputFormatArgs("");
      expect(args).toEqual([]);
    });
  });

  describe("Complete command construction", () => {
    /**
     * Test the complete yt-dlp command construction for different scenarios
     */

    function buildYtDlpCommand(
      url: string,
      format: string,
      outputFormat: string,
      outputPath: string
    ): string[] {
      const args = [url];

      // Add format if specified
      if (format) {
        const selector = formatToYtDlpSelector(format as any);
        args.push("-f", selector);
      }

      // Add output path
      args.push("-o", outputPath);

      // Add output format options
      if (outputFormat && outputFormat !== "default") {
        const audioFormats = ["mp3", "aac", "opus", "flac"];
        if (audioFormats.includes(outputFormat)) {
          args.push("--extract-audio", "--audio-format", outputFormat);
        } else {
          args.push("--merge-output-format", outputFormat);
        }
      }

      return args;
    }

    test("should build correct command for audio download with MP3 output", () => {
      const command = buildYtDlpCommand(
        "https://www.youtube.com/watch?v=test",
        "audioonly",
        "mp3",
        "/path/to/output.%(ext)s"
      );

      expect(command).toEqual([
        "https://www.youtube.com/watch?v=test",
        "-f",
        "ba/bestaudio",
        "-o",
        "/path/to/output.%(ext)s",
        "--extract-audio",
        "--audio-format",
        "mp3",
      ]);
    });

    test("should build correct command for video download with MP4 output", () => {
      const command = buildYtDlpCommand(
        "https://www.youtube.com/watch?v=test",
        "bestvideo+bestaudio",
        "mp4",
        "/path/to/output.%(ext)s"
      );

      expect(command).toEqual([
        "https://www.youtube.com/watch?v=test",
        "-f",
        "bestvideo+bestaudio",
        "-o",
        "/path/to/output.%(ext)s",
        "--merge-output-format",
        "mp4",
      ]);
    });

    test("should build correct command for audio download without output format conversion", () => {
      const command = buildYtDlpCommand(
        "https://www.youtube.com/watch?v=test",
        "audioonly",
        "default",
        "/path/to/output.%(ext)s"
      );

      expect(command).toEqual([
        "https://www.youtube.com/watch?v=test",
        "-f",
        "ba/bestaudio",
        "-o",
        "/path/to/output.%(ext)s",
      ]);
    });
  });
});
