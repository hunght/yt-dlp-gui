import { sql } from "drizzle-orm";
import fs from "fs";
import { getDatabasePath } from "../../utils/paths";
import db from ".";
import { logger } from "../../helpers/logger";
import { runMigrations, validateDatabaseIntegrity } from "./migrate";

// Safely import app from electron, might not be available in non-Electron contexts
let app: any;
try {
  app = require("electron").app;
} catch {
  app = null;
}

interface DatabaseConfig {
  maxRetries: number;
  retryDelayMs: number;
  autoBackup: boolean;
  performIntegrityCheck: boolean;
}

const DEFAULT_DB_CONFIG: DatabaseConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  autoBackup: true,
  performIntegrityCheck: true,
};

/**
 * Optimizes the SQLite database for better performance
 */
async function optimizeDatabase(): Promise<void> {
  logger.info("Optimizing database configuration...");

  try {
    // Enable WAL mode for better concurrency
    await db.run(sql`PRAGMA journal_mode = WAL`);

    // Set synchronous mode to NORMAL for better performance while maintaining safety
    await db.run(sql`PRAGMA synchronous = NORMAL`);

    // Set cache size (negative value means KB, positive means pages)
    await db.run(sql`PRAGMA cache_size = -64000`); // 64MB cache

    // Enable foreign key constraints
    await db.run(sql`PRAGMA foreign_keys = ON`);

    // Set busy timeout to handle lock contention
    await db.run(sql`PRAGMA busy_timeout = 30000`); // 30 seconds

    // Optimize for performance
    await db.run(sql`PRAGMA temp_store = MEMORY`);

    logger.info("Database optimization completed");
  } catch (error) {
    logger.warn("Database optimization failed, continuing with defaults:", error);
  }
}

/**
 * Performs database maintenance tasks
 */
async function performMaintenance(): Promise<void> {
  try {
    logger.info("Performing database maintenance...");

    // Analyze the database for query optimization
    await db.run(sql`ANALYZE`);

    // Optimize/defragment the database
    await db.run(sql`PRAGMA optimize`);

    logger.info("Database maintenance completed");
  } catch (error) {
    logger.warn("Database maintenance failed:", error);
  }
}

/**
 * Waits for the specified delay
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Initialize database with comprehensive setup and error handling
 */
const initDb = async (config: DatabaseConfig = DEFAULT_DB_CONFIG): Promise<void> => {
  const dbPath = getDatabasePath().replace("file:", "");
  logger.info("Initializing database at:", dbPath);

  // Run migrations with backup enabled
  await runMigrations({
    createBackup: config.autoBackup,
    verifyOnly: false,
    force: false,
  });

  // Optimize database configuration
  await optimizeDatabase();

  // Perform integrity check if requested
  if (config.performIntegrityCheck) {
    const isValid = await validateDatabaseIntegrity();
    if (!isValid) {
      throw new Error("Database integrity check failed after initialization");
    }
  }

  // Run maintenance tasks
  await performMaintenance();

  logger.info("Database initialization completed successfully");
};

/**
 * Enhanced database initialization with retry logic and recovery
 */
export const initializeDatabase = async (
  config: DatabaseConfig = DEFAULT_DB_CONFIG
): Promise<void> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      logger.info(`Database initialization attempt ${attempt}/${config.maxRetries}`);
      await initDb(config);
      logger.info("Database initialization successful");
      return;
    } catch (error) {
      lastError = error as Error;
      logger.error(`Database initialization attempt ${attempt} failed:`, error);

      if (error instanceof Error) {
        logger.error("Error details:", {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      }

      // If this is not the last attempt, wait before retrying
      if (attempt < config.maxRetries) {
        logger.info(`Waiting ${config.retryDelayMs}ms before retry...`);
        await delay(config.retryDelayMs);
        continue;
      }

      // Last attempt failed, try to recover
      logger.warn("All initialization attempts failed, attempting recovery...");
      break;
    }
  }

  // Recovery attempt
  try {
    const dbPath = getDatabasePath().replace("file:", "");
    if (fs.existsSync(dbPath)) {
      let appVersion: string;
      try {
        appVersion = app?.getVersion() || "unknown";
      } catch {
        // Fallback to package.json version when not in Electron context
        const packageJson = require("../../../package.json");
        appVersion = packageJson.version;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = `${dbPath}.${appVersion}.${timestamp}.corrupted`;

      logger.info(`Moving corrupted database to: ${backupPath}`);
      fs.renameSync(dbPath, backupPath);

      // Try initialization again with a fresh database
      logger.info("Attempting to initialize fresh database...");
      await initDb({
        ...config,
        autoBackup: false, // Don't backup the fresh database
        performIntegrityCheck: false, // Skip integrity check on fresh DB
      });

      logger.info("Successfully recovered with fresh database");
      return;
    } else {
      throw new Error("Database file not found for recovery");
    }
  } catch (recoveryError) {
    logger.fatal("Failed to recover database:", recoveryError);
    throw new Error(
      `Database initialization failed after ${config.maxRetries} attempts. Last error: ${lastError?.message}. Recovery also failed: ${recoveryError}`
    );
  }
};

/**
 * Gets database connection health status
 */
export const getDatabaseHealth = async (): Promise<{
  connected: boolean;
  integrityOk: boolean;
  version: string | null;
  size: number;
  lastMigration: string | null;
}> => {
  try {
    const dbPath = getDatabasePath().replace("file:", "");
    const size = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

    // Test connection
    await db.run(sql`SELECT 1`);

    // Check integrity
    const integrityOk = await validateDatabaseIntegrity();

    // Get SQLite version
    const versionResult = await db.all(sql`SELECT sqlite_version() as version`);
    const version = ((versionResult[0] as any)?.version as string) || null;

    // Get last migration
    let lastMigration: string | null = null;
    try {
      const migrationResult = await db.all(sql`
        SELECT hash FROM __drizzle_migrations
        ORDER BY created_at DESC
        LIMIT 1
      `);
      lastMigration = ((migrationResult[0] as any)?.hash as string) || null;
    } catch {
      // Migration table might not exist yet
      lastMigration = null;
    }

    return {
      connected: true,
      integrityOk,
      version,
      size,
      lastMigration,
    };
  } catch (error) {
    logger.error("Database health check failed:", error);
    return {
      connected: false,
      integrityOk: false,
      version: null,
      size: 0,
      lastMigration: null,
    };
  }
};
