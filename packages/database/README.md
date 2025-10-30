# @yt-dlp-gui/database

Shared database package containing the Drizzle ORM schema, migrations, and configuration for yt-dlp-gui applications.

## Features

- ✅ Centralized database schema
- ✅ Shared migrations
- ✅ Type-safe database access with Drizzle ORM
- ✅ SQLite/libSQL support
- ✅ Configurable database path per application

## Installation

This package is part of the monorepo workspace and is automatically available to other workspace packages.

```bash
# In your app's package.json
{
  "dependencies": {
    "@yt-dlp-gui/database": "workspace:*"
  }
}
```

## Usage

### Import Schema

```typescript
import { channels, youtubeVideos } from "@yt-dlp-gui/database/schema";
import { db } from "@yt-dlp-gui/database";
```

### Database Configuration

Each consuming application should create its own `drizzle.config.ts` that points to the shared schema but uses its own database path:

```typescript
// apps/your-app/drizzle.config.ts
import { defineConfig } from "drizzle-kit";
import { getDatabasePath } from "./src/utils/paths";

export default defineConfig({
  schema: "../../packages/database/src/schema.ts",
  out: "../../packages/database/drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: getDatabasePath(), // Your app-specific path
  },
  strict: true,
  verbose: true,
});
```

### Running Migrations

Migrations are stored in `packages/database/drizzle/` and shared across all applications.

From this package:
```bash
# Generate new migrations (after schema changes)
DATABASE_URL="file:./local.db" npm run db:generate

# Push schema changes directly (development)
DATABASE_URL="file:./local.db" npm run db:push

# Open Drizzle Studio
DATABASE_URL="file:./local.db" npm run db:studio
```

From your application:
```bash
# Your app uses its own config with app-specific database path
npm run db:generate  # Generate migrations
npm run db:migrate   # Apply migrations
npm run db:studio    # Open studio for your app's database
```

## Schema

### Tables

#### `channels`
Stores YouTube channel information.

#### `youtubeVideos`
Stores YouTube video information with integrated download tracking.

**Download-related fields:**
- `downloadStatus` - Current download status (pending, downloading, completed, failed, cancelled, queued, paused)
- `downloadProgress` - Download progress (0-100)
- `downloadFormat` - Selected download format
- `downloadQuality` - Selected quality
- `downloadFilePath` - Path to downloaded file
- `downloadFileSize` - Size of downloaded file
- `lastErrorMessage` - Last error message if failed
- `errorType` - Type of error
- `isRetryable` - Whether the download can be retried
- `lastDownloadedAt` - Timestamp of last successful download

## Architecture

```
packages/database/
├── src/
│   ├── index.ts        # Main exports
│   └── schema.ts       # Database schema
├── drizzle/            # Migrations (shared)
│   ├── 0000_*.sql
│   └── meta/
├── drizzle.config.ts   # Base config (uses DATABASE_URL env var)
└── package.json
```

## Development

### Adding New Tables/Columns

1. Update `src/schema.ts`
2. Generate migration: `DATABASE_URL="file:./local.db" npm run db:generate`
3. Test migration in your app: `cd apps/electron && npm run db:migrate`
4. Commit both schema and migration files

### Building

```bash
npm run build    # Build the package
npm run dev      # Watch mode
npm run clean    # Clean build artifacts
```

## Notes

- Migrations are shared across all applications
- Each application can have its own database file location
- The schema is the single source of truth
- Use `DATABASE_URL` environment variable when running commands from this package
