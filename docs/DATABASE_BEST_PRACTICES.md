# Database Best Practices

This document outlines the database architecture, migration system, and best practices implemented in this project.

## Overview

The application uses SQLite with Drizzle ORM for local data storage. The database system includes:

- **Automatic migrations** with backup and rollback capabilities
- **Connection management** with health monitoring and automatic reconnection
- **Performance optimization** with WAL mode, caching, and query optimization
- **Error handling and recovery** with automatic backup and restoration
- **Comprehensive utilities** for maintenance, monitoring, and debugging

## Database Architecture

### Components

- **`src/api/db/schema.ts`** - Database schema definitions using Drizzle
- **`src/api/db/index.ts`** - Connection management and database instance
- **`src/api/db/init.ts`** - Database initialization with optimizations
- **`src/api/db/migrate.ts`** - Migration system with safety features
- **`src/api/db/utils.ts`** - Utility functions for common operations
- **`drizzle/`** - Generated migration files

### Schema Design

```typescript
// Example table with best practices
export const youtubeVideos = sqliteTable(
  "youtube_videos",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull(),
    title: text("title").notNull(),
    // ... other columns
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at"),
  },
  (table) => [
    // Indexes for performance
    index("youtube_videos_video_id_idx").on(table.videoId),
    index("youtube_videos_published_at_idx").on(table.publishedAt),
    // Unique constraints
    unique().on(table.videoId),
  ]
);
```

## Migration System

### Features

- **Automatic backups** before running migrations
- **Integrity checks** before and after migrations
- **Recovery mechanisms** for corrupted databases
- **Rollback support** through backup restoration
- **Migration state tracking** and verification

### Usage

```bash
# Generate migration files
npm run db:generate

# Apply migrations (recommended)
npm run db:apply

# Migrate without backup (faster, but risky)
npm run db:migrate:no-backup

# Force migration (ignores integrity checks)
npm run db:migrate:force

# Verify migrations without applying
npm run db:verify

# Reset database completely
npm run db:reset
```

### Migration Safety

1. **Always backup** before production migrations
2. **Test migrations** in development first
3. **Monitor integrity** checks and logs
4. **Keep old backups** for emergency recovery

## Connection Management

### Features

- **Lazy connection** initialization
- **Health monitoring** with automatic reconnection
- **Graceful shutdown** handling
- **Query logging** in development mode
- **Performance monitoring** and statistics

### Connection Configuration

```typescript
// Optimized SQLite settings
PRAGMA journal_mode = WAL;      // Better concurrency
PRAGMA synchronous = NORMAL;    // Performance vs safety balance
PRAGMA cache_size = -64000;     // 64MB cache
PRAGMA foreign_keys = ON;       // Enforce constraints
PRAGMA busy_timeout = 30000;    // Handle lock contention
```

## Performance Optimizations

### Database Level

1. **WAL Mode** - Enables concurrent reads while writing
2. **Appropriate Indexing** - Indexes on frequently queried columns
3. **Query Optimization** - Regular ANALYZE commands
4. **Connection Pooling** - Reuse connections efficiently
5. **Prepared Statements** - Drizzle handles this automatically

### Application Level

1. **Batch Operations** - Process multiple records together
2. **Pagination** - Limit result sets for large queries
3. **Transaction Usage** - Group related operations
4. **Error Handling** - Automatic retry with exponential backoff

## Monitoring and Maintenance

### Health Checks

```bash
# Check database health
npm run db:health

# Get connection statistics
npm run db:status

# Test connection performance
npm run db:test-connection
```

### Maintenance Commands

```bash
# Create manual backup
npm run db:backup

# Vacuum database (reclaim space)
npm run db:vacuum

# Analyze for query optimization
npm run db:analyze

# Open database studio
npm run db:studio
```

### Monitoring Metrics

- Connection status and health
- Query performance and latency
- Database size and growth
- Migration status and history
- Error rates and recovery events

## Best Practices

### Schema Design

1. **Use appropriate data types** (TEXT, INTEGER, REAL, BLOB)
2. **Add indexes for queries** but avoid over-indexing
3. **Use foreign keys** for referential integrity
4. **Include timestamps** (createdAt, updatedAt)
5. **Use descriptive column names** with snake_case

### Query Patterns

```typescript
// Good: Use typed queries with Drizzle
const videos = await db
  .select()
  .from(youtubeVideos)
  .where(eq(youtubeVideos.channelId, channelId))
  .limit(50);

// Good: Use transactions for related operations
await withTransaction(async (tx) => {
  await tx.insert(youtubeVideos).values(newVideo);
  await tx.update(channelStats).set({ videoCount: sql`${channelStats.videoCount} + 1` });
});

// Good: Use batch processing for large datasets
await processBatch(videos, 100, async (batch) => {
  return await db.insert(youtubeVideos).values(batch);
});
```

### Error Handling

```typescript
// Good: Use safe query wrapper
const result = await safeQuery(
  () => db.select().from(youtubeVideos).where(eq(youtubeVideos.id, id)),
  "fetch-video-by-id"
);

// Good: Use retry mechanism for critical operations
const result = await withRetry(
  () => db.insert(youtubeVideos).values(video),
  3, // max retries
  1000 // delay ms
);
```

### Migration Guidelines

1. **Make migrations incremental** - small, focused changes
2. **Test thoroughly** in development environment
3. **Backup before production** migrations
4. **Monitor application** after migrations
5. **Keep rollback plan** ready

### Security Considerations

1. **Use parameterized queries** (Drizzle does this automatically)
2. **Validate input data** before database operations
3. **Limit database permissions** in production
4. **Encrypt sensitive data** before storing
5. **Regular security audits** of database access

## Troubleshooting

### Common Issues

1. **Database locked** - Check for long-running transactions
2. **Slow queries** - Run ANALYZE and check indexes
3. **Migration failures** - Check integrity and backup status
4. **Connection errors** - Monitor health checks and logs

### Debug Commands

```bash
# Enable debug logging
npm run db:debug

# Check database file
ls -la local.db*

# Manual SQL execution
npm run db:studio
```

### Recovery Procedures

1. **Corruption detected** - Automatic backup restoration
2. **Migration failure** - Restore from backup and retry
3. **Data loss** - Restore from most recent backup
4. **Performance issues** - Run vacuum and analyze

## Development Workflow

### Setting Up

1. Install dependencies: `npm install`
2. Generate initial migration: `npm run db:generate`
3. Apply migrations: `npm run db:apply`
4. Start development: `npm run dev`

### Making Schema Changes

1. Modify `src/api/db/schema.ts`
2. Generate migration: `npm run db:generate`
3. Review generated SQL in `drizzle/` folder
4. Test migration: `npm run db:verify`
5. Apply migration: `npm run db:migrate`

### Testing

1. Use in-memory database for tests
2. Reset database between tests
3. Test migration rollback scenarios
4. Verify data integrity after operations

## Production Deployment

### Pre-deployment

1. Backup production database
2. Test migrations in staging
3. Monitor disk space and performance
4. Prepare rollback procedures

### Post-deployment

1. Monitor application logs
2. Check database health
3. Verify data integrity
4. Monitor performance metrics

This comprehensive database system provides robust, scalable, and maintainable data storage for the YouTube downloader application.
