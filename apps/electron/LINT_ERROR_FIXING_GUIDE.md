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

## 10. When ESLint Exceptions Are Acceptable

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

