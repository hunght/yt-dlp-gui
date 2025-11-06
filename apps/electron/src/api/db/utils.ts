import { sql, and, or, eq, ne, lt, lte, gt, gte, like, inArray } from "drizzle-orm";
import { logger } from "../../helpers/logger";
import db from ".";

/**
 * Database utility functions for common operations
 */

/**
 * Executes a database operation with automatic retry and error handling
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Database operation attempt ${attempt}/${maxRetries} failed:`, error);

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
    }
  }

  throw lastError!;
}

/**
 * Executes multiple operations in a transaction
 */
export async function withTransaction<T>(operations: (tx: any) => Promise<T>): Promise<T> {
  return await db.transaction(async (tx) => {
    try {
      const result = await operations(tx);
      logger.debug("Transaction completed successfully");
      return result;
    } catch (error) {
      logger.error("Transaction failed, rolling back:", error);
      throw error;
    }
  });
}

/**
 * Safely executes a query with proper error handling and logging
 */
export async function safeQuery<T>(
  queryFn: () => Promise<T>,
  queryName: string = "unknown"
): Promise<T | null> {
  try {
    logger.debug(`Executing query: ${queryName}`);
    const result = await queryFn();
    logger.debug(`Query ${queryName} completed successfully`);
    return result;
  } catch (error) {
    logger.error(`Query ${queryName} failed:`, error);
    return null;
  }
}

/**
 * Checks if a table exists in the database
 */
export async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await db.all(sql`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name=${tableName}
    `);
    return result.length > 0;
  } catch (error) {
    logger.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}

/**
 * Gets table information including row count and size
 */
export async function getTableInfo(tableName: string): Promise<{
  exists: boolean;
  rowCount: number;
  columns: Array<{
    name: string;
    type: string;
    notNull: boolean;
    defaultValue: any;
    primaryKey: boolean;
  }>;
}> {
  try {
    const exists = await tableExists(tableName);
    if (!exists) {
      return { exists: false, rowCount: 0, columns: [] };
    }

    // Get row count
    const countResult = await db.all(
      sql`SELECT COUNT(*) as count FROM ${sql.identifier(tableName)}`
    );
    const rowCount = ((countResult[0] as any)?.count as number) || 0;

    // Get column information
    const columnsResult = await db.all(sql`PRAGMA table_info(${tableName})`);
    const columns = columnsResult.map((row: any) => ({
      name: row.name as string,
      type: row.type as string,
      notNull: Boolean(row.notnull),
      defaultValue: row.dflt_value,
      primaryKey: Boolean(row.pk),
    }));

    return { exists: true, rowCount, columns };
  } catch (error) {
    logger.error(`Error getting table info for ${tableName}:`, error);
    return { exists: false, rowCount: 0, columns: [] };
  }
}

/**
 * Safely drops a table if it exists
 */
export async function dropTableIfExists(tableName: string): Promise<boolean> {
  try {
    await db.run(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)}`);
    logger.info(`Table ${tableName} dropped successfully`);
    return true;
  } catch (error) {
    logger.error(`Error dropping table ${tableName}:`, error);
    return false;
  }
}

/**
 * Creates an index if it doesn't exist
 */
export async function createIndexIfNotExists(
  indexName: string,
  tableName: string,
  columns: string[],
  unique: boolean = false
): Promise<boolean> {
  try {
    const uniqueKeyword = unique ? "UNIQUE" : "";
    const columnsList = columns.map((col) => sql.identifier(col)).join(", ");

    await db.run(sql`
      CREATE ${sql.raw(uniqueKeyword)} INDEX IF NOT EXISTS ${sql.identifier(indexName)}
      ON ${sql.identifier(tableName)} (${sql.raw(columnsList)})
    `);

    logger.info(`Index ${indexName} created successfully`);
    return true;
  } catch (error) {
    logger.error(`Error creating index ${indexName}:`, error);
    return false;
  }
}

/**
 * Vacuum the database to reclaim space and optimize performance
 */
export async function vacuum(): Promise<boolean> {
  try {
    logger.info("Starting database vacuum...");
    await db.run(sql`VACUUM`);
    logger.info("Database vacuum completed successfully");
    return true;
  } catch (error) {
    logger.error("Database vacuum failed:", error);
    return false;
  }
}

/**
 * Analyze the database for query optimization
 */
export async function analyze(tableName?: string): Promise<boolean> {
  try {
    if (tableName) {
      logger.info(`Analyzing table: ${tableName}`);
      await db.run(sql`ANALYZE ${sql.identifier(tableName)}`);
    } else {
      logger.info("Analyzing entire database");
      await db.run(sql`ANALYZE`);
    }
    logger.info("Database analysis completed successfully");
    return true;
  } catch (error) {
    logger.error("Database analysis failed:", error);
    return false;
  }
}

/**
 * Gets database size information
 */
export async function getDatabaseSize(): Promise<{
  pageCount: number;
  pageSize: number;
  totalSize: number;
  freePages: number;
  schemaSize: number;
}> {
  try {
    const [pageCountResult, pageSizeResult, freePagesResult, schemaSizeResult] = await Promise.all([
      db.get(sql`PRAGMA page_count`),
      db.get(sql`PRAGMA page_size`),
      db.get(sql`PRAGMA freelist_count`),
      db.get(sql`PRAGMA schema_version`),
    ]);

    const pageCount = ((pageCountResult as any)?.page_count as number) || 0;
    const pageSize = ((pageSizeResult as any)?.page_size as number) || 0;
    const freePages = ((freePagesResult as any)?.freelist_count as number) || 0;
    const schemaSize = ((schemaSizeResult as any)?.schema_version as number) || 0;

    return {
      pageCount,
      pageSize,
      totalSize: pageCount * pageSize,
      freePages,
      schemaSize,
    };
  } catch (error) {
    logger.error("Error getting database size:", error);
    return {
      pageCount: 0,
      pageSize: 0,
      totalSize: 0,
      freePages: 0,
      schemaSize: 0,
    };
  }
}

/**
 * Exports commonly used drizzle operators for convenience
 */
export const operators = {
  and,
  or,
  eq,
  ne,
  lt,
  lte,
  gt,
  gte,
  like,
  inArray,
  sql,
};

/**
 * Pagination helper
 */
export interface PaginationOptions {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function getPaginationOffset(page: number, pageSize: number): number {
  return Math.max(0, (page - 1) * pageSize);
}

export function createPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / pageSize);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Batch processing helper
 */
export async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    try {
      const batchResults = await processor(batch);
      results.push(...batchResults);
    } catch (error) {
      logger.error(`Batch processing failed for batch starting at index ${i}:`, error);
      throw error;
    }
  }

  return results;
}

/**
 * Database connection test utility
 */
export async function testConnection(): Promise<{
  success: boolean;
  latency: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    await db.run(sql`SELECT 1`);
    const latency = Date.now() - startTime;

    return {
      success: true,
      latency,
    };
  } catch (error) {
    const latency = Date.now() - startTime;

    return {
      success: false,
      latency,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
