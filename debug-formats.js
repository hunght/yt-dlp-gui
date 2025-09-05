#!/usr/bin/env node

/**
 * YouTube Format Detection Utility
 *
 * This script helps debug and detect available download options for YouTube videos
 * using yt-dlp, based on the format detection logic from the yt-dlp-gui project.
 */

const { execSync } = require("child_process");

// Format mappings from the project's types.ts
const formatMappings = {
  // Popular video formats
  best: "bv*+ba/b", // Best video + best audio, fallback to best combined
  best1080p: "bv*[height<=1080]+ba/b[height<=1080]", // Best video up to 1080p + audio
  best720p: "bv*[height<=720]+ba/b[height<=720]", // Best video up to 720p + audio
  best480p: "bv*[height<=480]+ba/b[height<=480]", // Best video up to 480p + audio

  // Audio-only options
  audioonly: "ba/bestaudio", // Best audio only
  audio320: "ba[abr<=320]/bestaudio[abr<=320]", // Audio up to 320kbps
  audio128: "ba[abr<=128]/bestaudio[abr<=128]", // Audio up to 128kbps

  // Specific format preferences
  mp4best: "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]", // Best MP4 video + M4A audio
  webmbest: "bv*[ext=webm]+ba[ext=webm]/b[ext=webm]", // Best WebM video + WebM audio
  av1best: "bv*[vcodec^=av01]+ba/b[vcodec^=av01]", // Best AV1 codec

  // Advanced options
  best4k: "bv*[height<=2160]+ba/b[height<=2160]", // Best video up to 4K + audio
  best60fps: "bv*[fps>=60]+ba/bv*[fps>=30]+ba/bv*+ba", // Prefer 60fps, fallback to 30fps+
  bestsmall: "b[filesize<500M]/bv*[filesize<400M]+ba[filesize<100M]/b", // Under 500MB total
  worstgood: "bv*[height>=360]+ba/b[height>=360]", // At least 360p quality

  // Common working formats
  "bestvideo+bestaudio": "bestvideo+bestaudio", // Your working command
  best_single: "best", // Single best format
  worst: "worst", // Lowest quality (for testing)
};

function runYtDlp(url, args) {
  try {
    const command = `yt-dlp ${args.join(" ")} "${url}"`;
    console.log(`\n🔍 Testing: ${command}`);
    const output = execSync(command, {
      encoding: "utf8",
      timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message, stderr: error.stderr };
  }
}

function testFormat(url, formatName, formatSelector) {
  console.log(`\n📋 Testing format: ${formatName}`);
  console.log(`   Selector: ${formatSelector}`);

  const result = runYtDlp(url, ["-f", formatSelector, "--simulate", "--no-warnings"]);

  if (result.success) {
    console.log(`   ✅ WORKS - ${formatName}`);
    return true;
  } else {
    console.log(`   ❌ FAILED - ${formatName}`);
    if (result.stderr && result.stderr.includes("403")) {
      console.log(`   🚫 HTTP 403 Error - Format may be restricted`);
    } else if (result.stderr && result.stderr.includes("Requested format is not available")) {
      console.log(`   📭 Format not available for this video`);
    } else {
      console.log(`   💥 Error: ${result.error?.substring(0, 100)}`);
    }
    return false;
  }
}

function detectAvailableFormats(url) {
  console.log(`\n📊 Getting available formats for: ${url}`);

  const result = runYtDlp(url, ["--list-formats", "--no-warnings"]);

  if (result.success) {
    console.log(`\n📋 AVAILABLE FORMATS:`);
    console.log(result.output.substring(0, 2000));
    if (result.output.length > 2000) {
      console.log("\n... (truncated)");
    }
    return result.output;
  } else {
    console.log(`❌ Failed to get formats: ${result.error}`);
    return null;
  }
}

function getVideoInfo(url) {
  console.log(`\n📝 Getting video info for: ${url}`);

  const result = runYtDlp(url, ["--dump-json", "--no-warnings"]);

  if (result.success) {
    try {
      const info = JSON.parse(result.output);
      console.log(`\n📹 VIDEO INFO:`);
      console.log(`   Title: ${info.title}`);
      console.log(`   Duration: ${info.duration}s`);
      console.log(`   Uploader: ${info.uploader}`);
      console.log(`   Resolution: ${info.width}x${info.height}`);
      console.log(`   FPS: ${info.fps}`);

      if (info.formats && info.formats.length > 0) {
        console.log(`   Available formats: ${info.formats.length}`);

        // Show summary of format types
        const videoFormats = info.formats.filter((f) => f.vcodec && f.vcodec !== "none");
        const audioFormats = info.formats.filter(
          (f) => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none")
        );

        console.log(`   Video formats: ${videoFormats.length}`);
        console.log(`   Audio-only formats: ${audioFormats.length}`);

        // Show some example formats
        const exampleFormats = info.formats
          .slice(0, 5)
          .map(
            (f) =>
              `${f.format_id} (${f.ext}, ${f.resolution || "audio"}, ${f.vcodec || "N/A"}/${f.acodec || "N/A"})`
          );
        console.log(`   Example formats: ${exampleFormats.join(", ")}`);
      }

      return info;
    } catch (error) {
      console.log(`❌ Failed to parse video info: ${error.message}`);
      return null;
    }
  } else {
    console.log(`❌ Failed to get video info: ${result.error}`);
    return null;
  }
}

function main() {
  const url = process.argv[2] || "https://www.youtube.com/watch?v=imdTKPQW9ek";

  console.log(`🎬 YouTube Format Detection Utility`);
  console.log(`🔗 URL: ${url}`);
  console.log(`⚡ Based on yt-dlp-gui project format mappings`);

  // Step 1: Get video info
  const videoInfo = getVideoInfo(url);

  // Step 2: List available formats
  const availableFormats = detectAvailableFormats(url);

  // Step 3: Test each format mapping
  console.log(`\n🧪 TESTING FORMAT MAPPINGS:`);
  console.log(`============================================`);

  const workingFormats = [];
  const failedFormats = [];

  for (const [formatName, formatSelector] of Object.entries(formatMappings)) {
    const works = testFormat(url, formatName, formatSelector);
    if (works) {
      workingFormats.push({ name: formatName, selector: formatSelector });
    } else {
      failedFormats.push({ name: formatName, selector: formatSelector });
    }
  }

  // Step 4: Summary
  console.log(`\n📊 SUMMARY:`);
  console.log(`============`);
  console.log(`✅ Working formats: ${workingFormats.length}`);
  console.log(`❌ Failed formats: ${failedFormats.length}`);

  if (workingFormats.length > 0) {
    console.log(`\n🎯 RECOMMENDED FORMATS:`);
    workingFormats.forEach((format) => {
      console.log(`   ${format.name}: ${format.selector}`);
    });
  }

  if (failedFormats.length > 0) {
    console.log(`\n⚠️  FAILED FORMATS:`);
    failedFormats.forEach((format) => {
      console.log(`   ${format.name}: ${format.selector}`);
    });
  }

  // Step 5: Recommendations
  console.log(`\n💡 RECOMMENDATIONS:`);
  console.log(`=================`);

  if (workingFormats.find((f) => f.name === "bestvideo+bestaudio")) {
    console.log(`✅ Your current command "bestvideo+bestaudio" works!`);
  }

  if (workingFormats.find((f) => f.name === "best720p")) {
    console.log(`✅ 720p format works - good for most uses`);
  }

  if (workingFormats.find((f) => f.name === "audioonly")) {
    console.log(`✅ Audio-only download available`);
  }

  console.log(`\n🔧 CLI DEBUG COMMANDS:`);
  console.log(`====================`);
  console.log(`# List all formats:`);
  console.log(`yt-dlp --list-formats "${url}"`);
  console.log(`\n# Test specific format:`);
  console.log(`yt-dlp -f "FORMAT_SELECTOR" --simulate "${url}"`);
  console.log(`\n# Download with verbose output:`);
  console.log(`yt-dlp -v -f "FORMAT_SELECTOR" "${url}"`);
  console.log(`\n# Check format availability:`);
  console.log(`yt-dlp --check-formats -f "FORMAT_SELECTOR" "${url}"`);

  console.log(`\n✨ Done!`);
}

if (require.main === module) {
  main();
}
