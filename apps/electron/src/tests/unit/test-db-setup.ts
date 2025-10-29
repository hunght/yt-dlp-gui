import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { sql } from "drizzle-orm";
import * as schema from "../../api/db/schema";
import path from "path";
import fs from "fs";

export interface TestDatabase {
  db: ReturnType<typeof drizzle>;
  client: ReturnType<typeof createClient>;
  cleanup: () => Promise<void>;
}

/**
 * Creates a test database with a unique name for each test
 */
export async function createTestDatabase(testName: string): Promise<TestDatabase> {
  // Create a unique database file for this test
  const testDbPath = path.join(process.cwd(), `test-${testName}-${Date.now()}.db`);

  // Create the client
  const client = createClient({
    url: `file:${testDbPath}`,
    authToken: "",
    syncUrl: undefined,
    encryptionKey: undefined,
  });

  // Create the drizzle instance
  const db = drizzle(client, {
    schema,
    logger: false, // Disable logging in tests
  });

  // Run migrations to set up the schema
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  // Clear any existing data (downloads table merged into youtube_videos)
  await db.delete(schema.youtubeVideos);

  // Cleanup function
  const cleanup = async () => {
    try {
      await client.close();
      // Remove all SQLite related files (main db, WAL, SHM)
      const filesToRemove = [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`];

      filesToRemove.forEach((filePath) => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (error) {
      console.warn("Error cleaning up test database:", error);
    }
  };

  return { db, client, cleanup };
}

/**
 * Creates a test database that's shared across multiple tests
 * Useful for integration tests that need to share data
 */
export async function createSharedTestDatabase(): Promise<TestDatabase> {
  const testDbPath = path.join(process.cwd(), "test-shared.db");

  const client = createClient({
    url: `file:${testDbPath}`,
    authToken: "",
    syncUrl: undefined,
    encryptionKey: undefined,
  });

  const db = drizzle(client, {
    schema,
    logger: false,
  });

  // Run migrations
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  // Clear any existing data (downloads table merged into youtube_videos)
  await db.delete(schema.youtubeVideos);

  const cleanup = async () => {
    try {
      await client.close();
      // Remove all SQLite related files (main db, WAL, SHM)
      const filesToRemove = [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`];

      filesToRemove.forEach((filePath) => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (error) {
      console.warn("Error cleaning up shared test database:", error);
    }
  };

  return { db, client, cleanup };
}

/**
 * Creates a test database with real data cloned from local.db
 * Useful for integration tests that need to work with real data
 */
export async function createTestDatabaseWithRealData(testName: string): Promise<TestDatabase> {
  // Create a unique database file for this test
  const testDbPath = path.join(process.cwd(), `test-${testName}-${Date.now()}.db`);
  const localDbPath = path.join(process.cwd(), "local.db");

  // First, copy the local.db file to the test database path
  if (fs.existsSync(localDbPath)) {
    fs.copyFileSync(localDbPath, testDbPath);
    console.log(`Cloned real data from ${localDbPath} to ${testDbPath}`);
  } else {
    throw new Error("local.db file not found. Cannot clone real data.");
  }

  // Create the client
  const client = createClient({
    url: `file:${testDbPath}`,
    authToken: "",
    syncUrl: undefined,
    encryptionKey: undefined,
  });

  // Create the drizzle instance
  const db = drizzle(client, {
    schema,
    logger: false, // Disable logging in tests
  });

  // Run migrations to ensure schema is up to date
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  // Cleanup function
  const cleanup = async () => {
    try {
      await client.close();
      // Remove all SQLite related files (main db, WAL, SHM)
      const filesToRemove = [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`];

      filesToRemove.forEach((filePath) => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (error) {
      console.warn("Error cleaning up test database with real data:", error);
    }
  };

  return { db, client, cleanup };
}

/**
 * Seeds the test database with sample data
 */
export async function seedTestDatabase(db: ReturnType<typeof drizzle>) {
  const { youtubeVideos } = schema; // downloads table removed, merged into youtube_videos
  const timestamp = Date.now();

  // Insert sample YouTube videos
  await db.insert(youtubeVideos).values([
    {
      id: "test-video-1",
      videoId: "dQw4w9WgXcQ",
      title: "Test Video 1",
      description: "A test video description",
      channelId: "test-channel-1",
      channelTitle: "Test Channel 1",
      durationSeconds: 212,
      viewCount: 1000000,
      likeCount: 50000,
      thumbnailUrl: "https://example.com/thumb1.jpg",
      publishedAt: timestamp - 86400000, // 1 day ago
      tags: JSON.stringify(["test", "video"]),
      raw: JSON.stringify({ test: "data" }),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "test-video-2",
      videoId: "test-video-2-id",
      title: "Test Video 2",
      description: "Another test video",
      channelId: "test-channel-2",
      channelTitle: "Test Channel 2",
      durationSeconds: 180,
      viewCount: 500000,
      likeCount: 25000,
      thumbnailUrl: "https://example.com/thumb2.jpg",
      publishedAt: timestamp - 172800000, // 2 days ago
      tags: JSON.stringify(["test", "another"]),
      raw: JSON.stringify({ test: "data2" }),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);

  // Note: Download seeding removed - downloads table merged into youtube_videos
  // Download status is now tracked directly in the youtube_videos table
  // To seed videos with download status, add downloadStatus, downloadProgress, etc. to the video records above
}

/**
 * Clears all data from the test database
 */
export async function clearTestDatabase(db: ReturnType<typeof drizzle>) {
  const { youtubeVideos } = schema; // downloads table removed

  await db.delete(youtubeVideos);
}

/**
 * Helper to create a test context for tRPC procedures
 */
export function createTestContext(db: ReturnType<typeof drizzle>) {
  return {
    db,
  };
}
