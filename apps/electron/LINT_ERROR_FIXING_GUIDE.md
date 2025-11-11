# Lint Error Fixing Guide

This guide documents patterns and best practices for fixing lint errors with our strict TypeScript ESLint rules.

## Strict Rules Enabled

```js
"@typescript-eslint/no-explicit-any": "error"
"@typescript-eslint/consistent-type-assertions": ["error", { "assertionStyle": "never" }]
"@typescript-eslint/no-unsafe-assignment": "error"
"@typescript-eslint/no-unsafe-member-access": "error"
"@typescript-eslint/no-unsafe-call": "error"
"@typescript-eslint/no-unsafe-return": "error"
```

---

## 1. Replace `any` with Proper Types

### ❌ Bad
```typescript
let data: any = fetchData();
const result: any = JSON.parse(json);
```

### ✅ Good - Use Drizzle inferred types
```typescript
import { type YoutubeVideo, type ChannelPlaylist } from "@/api/db/schema";

let data: YoutubeVideo = fetchData();
let playlist: ChannelPlaylist | null = null;
```

### ✅ Good - Use Zod for external data
```typescript
const dataSchema = z.object({
  title: z.string(),
  count: z.number().optional(),
});

const result = dataSchema.parse(JSON.parse(json)); // Fully typed!
```

---

## 2. Handle JSON.parse Results

### ❌ Bad
```typescript
const data = JSON.parse(json);
const value = data.someField; // Unsafe member access
```

### ✅ Good - Use Zod validation
```typescript
const responseSchema = z.object({
  someField: z.string(),
  anotherField: z.number().optional(),
});

const data = responseSchema.parse(JSON.parse(json));
const value = data.someField; // Type-safe!
```

---

## 3. Replace Type Assertions

### ❌ Bad (type assertions banned)
```typescript
const user = data as User;
const id = value as string;
const config = { ...options } as Config;
```

### ✅ Good - Use Zod
```typescript
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const user = userSchema.parse(data);
```

### ✅ Good - Use type guards
```typescript
function isString(value: unknown): value is string {
  return typeof value === "string";
}

if (isString(value)) {
  const id = value; // TypeScript knows it's a string
}
```

---

## 4. Handle Errors in Catch Blocks

### ❌ Bad
```typescript
catch (e) {
  logger.error("Failed", e as Error);
}
```

### ✅ Good - Let logger handle it
```typescript
catch (e) {
  logger.error("Failed", e); // Logger normalizes errors automatically
}
```

### ✅ Good - Manual normalization if needed
```typescript
catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  throw error;
}
```

---

## 5. Handle Non-Null Assertions

### ❌ Bad
```typescript
const title = item.video!.title;
const id = map.get(key)!;
```

### ✅ Good - Use type guards
```typescript
// For filter + map chains
const videos = items
  .filter((item): item is typeof item & { video: YoutubeVideo } => item.video !== null)
  .map((item) => ({
    title: item.video.title, // No ! needed
  }));
```

### ✅ Good - Use nullish coalescing
```typescript
const id = map.get(key) ?? 0;
const title = item.video?.title ?? "Untitled";
```

---

## 6. Handle Dynamic Imports/Requires

### ❌ Bad
```typescript
const mod = require("some-module");
const value = mod.something; // Unsafe
```

### ✅ Good - Use dynamic import
```typescript
const mod = await import("some-module");
const value = mod.something; // Fully typed!
```

### ✅ Good - For Electron modules
```typescript
const { app } = await import("electron");
const userData = app.getPath("userData"); // Type-safe!
```

---

## 7. Handle Array/Object Access

### ❌ Bad
```typescript
videos.sort((a: any, b: any) => a.id - b.id);
videos.map((v: any) => v.title);
```

### ✅ Good - Use proper types
```typescript
videos.sort((a: YoutubeVideo, b: YoutubeVideo) => {
  const aIndex = orderMap.get(a.videoId) ?? 0;
  const bIndex = orderMap.get(b.videoId) ?? 0;
  return aIndex - bIndex;
});

videos.map((v: YoutubeVideo) => v.title);
```

---

## 8. Handle Stream Data (Buffer)

### ❌ Bad
```typescript
proc.stdout?.on("data", (d) => out += d.toString()); // d is any
```

### ✅ Good - Type the callback parameter
```typescript
proc.stdout?.on("data", (d: Buffer | string) => {
  out += d.toString();
});
```

---

## 9. Database Insert/Update Types

### ❌ Bad
```typescript
const data = { ...fields } as any;
await db.insert(table).values(data);
```

### ✅ Good - Use Drizzle types
```typescript
import { type NewYoutubeVideo } from "@/api/db/schema";

const data: Omit<NewYoutubeVideo, "id" | "createdAt"> = {
  videoId: vid,
  title: title,
  // ... other required fields
};

await db.insert(youtubeVideos).values({
  id: crypto.randomUUID(),
  createdAt: now,
  ...data,
});
```

---

## 10. tRPC Type Safety (Backend as Source of Truth)

### ❌ Bad - Frontend Zod validation for tRPC responses
```typescript
// Frontend
const responseSchema = z.union([
  z.object({ success: z.literal(true), data: z.string() }),
  z.object({ success: z.literal(false), message: z.string() }),
]);

onSuccess: (res: unknown) => {
  const parsed = responseSchema.safeParse(res);
  if (!parsed.success) return;
  // ... handle parsed.data
}
```

### ✅ Good - Define types on backend, let tRPC infer
```typescript
// Backend (routers/example/index.ts)
type ExampleSuccess = {
  success: true;
  data: string;
  timestamp: number;
};

type ExampleFailure = {
  success: false;
  message: string;
};

type ExampleResult = ExampleSuccess | ExampleFailure;

export const exampleRouter = t.router({
  doSomething: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }): Promise<ExampleResult> => {
      // TypeScript enforces return type matches ExampleResult
      if (somethingFailed) {
        return { success: false, message: "Error" };
      }
      return { success: true, data: "result", timestamp: Date.now() };
    }),
});

// Frontend (automatically typed via tRPC!)
onSuccess: (response) => {
  // TypeScript knows response is ExampleResult
  if (response.success) {
    console.log(response.data); // Type-safe access
  } else {
    console.log(response.message); // Type-safe access
  }
}
```

**Real-world example (Transcript Download):**
```typescript
// Backend: apps/electron/src/api/routers/transcripts/index.ts
type DownloadTranscriptSuccess = {
  success: true;
  videoId: string;
  language: string;
  length: number;
  fromCache?: boolean;
};

type DownloadTranscriptFailure =
  | {
      success: false;
      code: "RATE_LIMITED";
      retryAfterMs: number;
      message: string;
    }
  | {
      success: false;
      message: string;
    };

type DownloadTranscriptResult = DownloadTranscriptSuccess | DownloadTranscriptFailure;

export const transcriptsRouter = t.router({
  download: publicProcedure
    .input(z.object({ videoId: z.string(), lang: z.string().optional() }))
    .mutation(async ({ input }): Promise<DownloadTranscriptResult> => {
      // TypeScript enforces all return statements match DownloadTranscriptResult
      if (!binPath) {
        return { success: false, message: "yt-dlp binary not installed" };
      }

      if (rateLimited) {
        return {
          success: false,
          code: "RATE_LIMITED",
          retryAfterMs: 15 * 60 * 1000,
          message: "Too many requests",
        };
      }

      return {
        success: true,
        videoId: input.videoId,
        language: detectedLang,
        length: text.length,
      };
    }),
});

// Frontend: apps/electron/src/pages/player/components/TranscriptPanel.tsx
const downloadTranscriptMutation = useMutation({
  mutationFn: async () => {
    return await trpcClient.transcripts.download.mutate({
      videoId,
      lang: selectedLang ?? undefined,
    });
  },
  onSuccess: (response) => {
    // tRPC automatically infers response type from backend!
    if (response.success) {
      // TypeScript knows: response.videoId, response.language, response.length exist
      queryClient.invalidateQueries({ queryKey: ["transcript", videoId] });
      return;
    }

    // Handle discriminated union with type guard
    if ("code" in response && response.code === "RATE_LIMITED") {
      // TypeScript knows: response.retryAfterMs exists
      setCooldown(videoId, selectedLang, response.retryAfterMs);
      return;
    }

    // TypeScript knows: response.message exists
    toastHook({ title: "Failed", description: response.message });
  },
});
```

**Benefits:**
- No duplicate validation logic
- Backend is the single source of truth
- Compile-time type checking (not just runtime)
- Refactoring is safer (change backend type → frontend shows errors immediately)
- Cleaner, more maintainable code
- TypeScript infers all types automatically through tRPC

**When to use Zod on frontend:**
- External APIs (not tRPC) - e.g., Google Translate API, Dictionary API
- Browser APIs (localStorage, etc.)
- User file uploads
- Third-party libraries

---

## 11. LocalStorage JSON Parsing with Type Guards

### ❌ Bad - Type assertions for localStorage data
```typescript
const raw = localStorage.getItem("my-data");
const parsed: unknown = raw ? JSON.parse(raw) : {};
const map: Record<string, number> = parsed as Record<string, number>; // Type assertion!
```

### ✅ Good - Type guard pattern
```typescript
// Define type guard
function isMyDataMap(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object") return false;

  return Object.entries(value).every(
    ([key, val]) => typeof key === "string" && typeof val === "number"
  );
}

// Safe parser function
function parseMyData(raw: string | null): Record<string, number> {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    return isMyDataMap(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Usage - fully type-safe!
const raw = localStorage.getItem("my-data");
const map = parseMyData(raw);
map["key"] = 123; // Type-safe
```

**Benefits:**
- No type assertions needed
- Runtime validation ensures data structure
- Handles corrupt localStorage gracefully
- Reusable parser pattern

---

## 12. Router Navigation with Optional Properties

### ❌ Bad - Explicitly sending undefined
```typescript
navigate({
  to: "/player",
  search: {
    videoId: video.videoId,
    playlistId: undefined,  // Don't send undefined explicitly
    playlistIndex: undefined,  // Don't send undefined explicitly
  },
});
```

### ✅ Good - Only send defined properties
```typescript
navigate({
  to: "/player",
  search: {
    videoId: video.videoId,
    // Omit optional properties when undefined
  },
});

// Or conditionally include them:
navigate({
  to: "/player",
  search: {
    videoId: video.videoId,
    ...(playlistId && { playlistId }),
    ...(playlistIndex !== undefined && { playlistIndex }),
  },
});
```

**Benefits:**
- Cleaner URLs (no `?playlistId=undefined` in address bar)
- Follows REST API best practices
- More readable code
- Smaller payload

---

## 12. When ESLint Exceptions Are Acceptable

### ✅ Rare cases only
```typescript
// Only when absolutely necessary (e.g., globalThis access, legacy modules)
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const value = (globalThis as Record<string, unknown>).__customProperty;
```

### 📋 File-level exceptions
Only for infrastructure files (logger, etc.) that require dynamic module loading:

```js
// In eslint.config.js
{
  files: ['src/helpers/logger.ts'],
  rules: {
    '@typescript-eslint/consistent-type-assertions': 'off',
  },
}
```

**Minimize scope**: Only disable specific rules, keep all others active.

---

## Quick Reference

| Error | Solution |
|-------|----------|
| `Unexpected any` | Use proper types from Drizzle, Zod, or interfaces |
| `Unsafe assignment` | Use Zod validation or type guards |
| `Unsafe member access` | Validate with Zod or check with type guards |
| `Do not use any type assertions` | Use Zod `.parse()` or type guards |
| `Unsafe call` | Ensure proper typing before calling |
| `no-non-null-assertion (!)` | Use optional chaining `?.` or nullish coalescing `??` |

---

## Testing Pattern

After fixing lint errors:

```bash
# Check specific file
npm run lint -- path/to/file.ts

# Check all files
npm run lint
```

---

## Incremental Commit Workflow

**⚠️ IMPORTANT**: After refactoring each file or module, commit immediately to ensure changes pass all checks.

### Step-by-Step Process

1. **Fix lint errors in one file/module**
   ```bash
   # Focus on one file at a time
   npm run lint -- src/api/routers/playlists/index.ts
   ```

2. **Verify the fix**
   ```bash
   # Run all checks for the changed file
   npm run lint -- src/api/routers/playlists/index.ts
   npm run type-check
   npm test -- --findRelatedTests src/api/routers/playlists/index.ts
   ```

3. **Commit immediately**
   ```bash
   git add src/api/routers/playlists/index.ts
   git commit -m "refactor: fix type safety in playlists router"
   ```

   This triggers pre-commit hooks which will:
   - ✅ Auto-format code
   - ✅ Run linter with auto-fix
   - ✅ Run tests for changed files
   - ✅ Run type-check

   If hooks fail, fix issues and amend the commit:
   ```bash
   # Fix issues
   git add .
   git commit --amend --no-edit
   ```

4. **Repeat for next file**
   - Don't try to fix the entire codebase at once
   - One file/module per commit ensures easier debugging
   - Each commit is a verified, working state

### Recommended Order

1. **Infrastructure first**: logger, utils, helpers
2. **Database layer**: schema, migrations, queries
3. **API routers**: one router at a time
4. **UI components**: pages, components

### Benefits of Incremental Commits

- ✅ **Easy rollback** - if something breaks, revert one commit
- ✅ **Clear history** - see exactly what changed per file
- ✅ **Faster debugging** - narrow down issues to specific commits
- ✅ **Verified progress** - pre-commit hooks validate each step
- ✅ **Reviewable** - smaller diffs are easier to review

### Example Workflow

```bash
# Day 1: Fix logger
npm run lint -- src/helpers/logger.ts
# ... fix errors ...
git add src/helpers/logger.ts
git commit -m "refactor: make logger fully type-safe with dynamic imports"
# ✅ Hooks pass

# Day 1: Fix database utils
npm run lint -- src/api/db/init.ts src/api/db/migrate.ts
# ... fix errors ...
git add src/api/db/
git commit -m "refactor: add Zod validation to database init/migrate"
# ✅ Hooks pass

# Day 2: Fix playlists router
npm run lint -- src/api/routers/playlists/index.ts
# ... fix errors (168 errors → 0) ...
git add src/api/routers/playlists/index.ts
git commit -m "refactor: add type safety to playlists router (168 fixes)"
# ✅ Hooks pass

# Continue...
```

---

## Key Takeaways

1. **Use Zod for ALL external data** (JSON.parse, API responses, yt-dlp output)
2. **Use Drizzle types for ALL database operations** (`$inferSelect`, `$inferInsert`)
3. **Prefer `await import()` over `require()`** for full type safety
4. **Let logger handle errors** - it normalizes `unknown` → `Error` automatically
5. **Type guards over assertions** - use predicates that TypeScript understands
6. **Minimize ESLint exceptions** - only when technically impossible to avoid

---

## Example: Complete Refactor

### Before (168 errors)
```typescript
let playlistMeta: any | null = null;
const data = JSON.parse(json);
const videos = items.map((item) => ({
  title: item.video!.title,
}));
videos.sort((a: any, b: any) => a.id - b.id);
```

### After (0 errors)
```typescript
let playlistMeta: ChannelPlaylist | null = null;

const data = ytDlpPlaylistDataSchema.parse(JSON.parse(json));

const videos = items
  .filter((item): item is typeof item & { video: YoutubeVideo } => item.video !== null)
  .map((item) => ({
    title: item.video.title,
  }));

videos.sort((a: YoutubeVideo, b: YoutubeVideo) => {
  const aIndex = orderMap.get(a.videoId) ?? 0;
  const bIndex = orderMap.get(b.videoId) ?? 0;
  return aIndex - bIndex;
});
```

