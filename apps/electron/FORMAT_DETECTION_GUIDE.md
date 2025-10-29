# YouTube Format Detection and Debugging Guide

## Summary of Your Working Command

Your command `yt-dlp -f "bestvideo+bestaudio" --merge-output-format mp4 "https://www.youtube.com/watch?v=imdTKPQW9ek"` **works perfectly fine** because:

1. **Format Selection**: `bestvideo+bestaudio` downloads the best available video and audio streams separately and merges them
2. **Merge Format**: `--merge-output-format mp4` ensures the final output is in MP4 format
3. **Compatibility**: This approach bypasses many YouTube restrictions and signature issues

## Why It Works vs Other Formats

### ✅ Working Formats (Tested):

- `bestvideo+bestaudio` - Your current command
- `bv*+ba/b` - Best video + audio with fallback
- `ba/bestaudio` - Audio-only downloads
- `bv*[ext=webm]+ba[ext=webm]/b[ext=webm]` - WebM format preference

### ❌ Problematic Formats:

- `best[height<=720]` - YouTube often restricts these combined formats
- `bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]` - MP4 formats often get 403 errors
- Height-based filters like `[height<=1080]` - Often fail due to signature issues

## Detection Methods and CLI Debug Commands

### 1. List All Available Formats

```bash
yt-dlp --list-formats "URL"
```

### 2. Test Format Before Download

```bash
yt-dlp -f "FORMAT_SELECTOR" --simulate "URL"
```

### 3. Verbose Debug Information

```bash
yt-dlp -v -f "FORMAT_SELECTOR" "URL"
```

### 4. Check Format Availability

```bash
yt-dlp --check-formats -f "FORMAT_SELECTOR" "URL"
```

### 5. Get Video Metadata

```bash
yt-dlp --dump-json "URL"
```

## Format Selection Strategies

### For Maximum Compatibility (Recommended)

```bash
# Your working approach - always reliable
yt-dlp -f "bestvideo+bestaudio" --merge-output-format mp4 "URL"
```

### For Specific Quality Needs

```bash
# Best overall quality (might fail on some videos)
yt-dlp -f "bv*+ba/b" "URL"

# Audio only (very reliable)
yt-dlp -f "ba/bestaudio" "URL"

# WebM format (smaller files, good compatibility)
yt-dlp -f "bv*[ext=webm]+ba[ext=webm]/b[ext=webm]" "URL"
```

### Format Testing Hierarchy (Use in Order)

1. `bestvideo+bestaudio` (most reliable)
2. `bv*+ba/b` (best with fallback)
3. `ba/bestaudio` (audio only fallback)

## Common Issues and Solutions

### Issue 1: "nsig extraction failed" Warning

**Cause**: YouTube signature extraction problems (common with older yt-dlp versions)
**Solution**:

- Update yt-dlp: `pip install --upgrade yt-dlp`
- Use `bestvideo+bestaudio` format (bypasses signature issues)

### Issue 2: "HTTP Error 403: Forbidden"

**Cause**: YouTube restricts certain format combinations
**Solution**:

- Avoid MP4-specific selectors
- Use WebM or mixed format approaches
- Fall back to `bestvideo+bestaudio`

### Issue 3: "Requested format is not available"

**Cause**: Format selector too specific for the video
**Solution**:

- Check available formats first with `--list-formats`
- Use broader selectors with fallbacks (e.g., `bv*+ba/b`)

## Format Detection Programmatically

### In Your Application

Looking at your codebase, the `formatToYtDlpSelector()` function in `types.ts` maps user-friendly names to yt-dlp selectors. Based on testing:

#### Working Mappings to Use:

```typescript
const reliableFormats = {
  best: "bv*+ba/b", // ✅ Works
  audioonly: "ba/bestaudio", // ✅ Works
  webmbest: "bv*[ext=webm]+ba[ext=webm]/b[ext=webm]", // ✅ Works
  "bestvideo+bestaudio": "bestvideo+bestaudio", // ✅ Your working format
};
```

#### Problematic Mappings to Avoid:

```typescript
// These often fail due to YouTube restrictions:
"best720p": "bv*[height<=720]+ba/b[height<=720]",     // ❌ Often fails
"mp4best": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]",     // ❌ 403 errors
"best1080p": "bv*[height<=1080]+ba/b[height<=1080]",  // ❌ Often fails
```

### Testing Format Before Download

Your codebase already implements format testing in `checkVideoAccessibility`. Enhance it by:

1. **Test multiple fallback formats**:

```typescript
const testFormats = [
  "bestvideo+bestaudio", // Most reliable
  "bv*+ba/b", // Good fallback
  "ba/bestaudio", // Audio-only fallback
];
```

2. **Handle specific errors**:

```typescript
// Check for 403 errors (format restrictions)
// Check for "not available" (format doesn't exist)
// Check for signature failures
```

## Advanced Format Detection

### Detect Specific Capabilities

```bash
# Check if 4K is available
yt-dlp -f "bv*[height>=2160]" --simulate "URL"

# Check for 60fps
yt-dlp -f "bv*[fps>=60]" --simulate "URL"

# Check for specific codecs
yt-dlp -f "bv*[vcodec^=av01]" --simulate "URL"  # AV1
yt-dlp -f "bv*[vcodec^=vp9]" --simulate "URL"   # VP9
```

### Parse Available Formats

```bash
# Get structured format data
yt-dlp --dump-json "URL" | jq '.formats[] | {id: .format_id, ext: .ext, quality: .quality, height: .height, fps: .fps, vcodec: .vcodec, acodec: .acodec}'
```

## Recommendations for Your App

1. **Keep using `bestvideo+bestaudio`** - it's the most reliable approach
2. **Implement format fallback** - test multiple formats in order of preference
3. **Update yt-dlp regularly** - signature extraction improves with updates
4. **Add format validation** - test format availability before attempting download
5. **Consider user preferences** - allow users to choose between quality vs compatibility

## Quick Debug Script Usage

Use the `debug-formats.js` script I created:

```bash
# Test current video
node debug-formats.js "https://www.youtube.com/watch?v=imdTKPQW9ek"

# Test any YouTube video
node debug-formats.js "YOUR_YOUTUBE_URL"
```

This will test all your application's format mappings and show which ones work for any given video.
