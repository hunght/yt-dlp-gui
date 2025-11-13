import { drizzle } from "drizzle-orm/libsql";
import { createClient, type Client } from "@libsql/client";
import { getDatabasePath } from "../../utils/paths";
import { logger } from "../../helpers/logger";
import * as schema from "./schema";

interface DatabaseConnection {
  db: ReturnType<typeof drizzle>;
  client: Client;
  isConnected: boolean;
  lastHealthCheck: Date | null;
}

let connection: DatabaseConnection | null = null;

/**
 * Creates a new database client with optimal configuration
 */
function createDatabaseClient(): Client {
  const dbPath = getDatabasePath();

  return createClient({
    url: dbPath,
    authToken: "",
    // Connection configuration for better performance and reliability
    syncUrl: undefined, // Disable sync for local-only usage
    encryptionKey: undefined, // No encryption for local development
  });
}

/**
 * Initializes the database connection with error handling
 */
function initializeConnection(): DatabaseConnection {
  try {
    logger.info("Initializing database connection...");

    const client = createDatabaseClient();
    const db = drizzle(client, {
      schema,
      // Disable query logging to reduce console noise
      logger: undefined,
    });

    const connection: DatabaseConnection = {
      db,
      client,
      isConnected: true,
      lastHealthCheck: new Date(),
    };

    logger.info("Database connection initialized successfully");
    return connection;
  } catch (error) {
    logger.error("Failed to initialize database connection:", error);
    throw error;
  }
}

/**
 * Gets the database connection, creating it if necessary
 */
function getConnection(): DatabaseConnection {
  if (!connection || !connection.isConnected) {
    connection = initializeConnection();
  }

  // Update health check timestamp
  connection.lastHealthCheck = new Date();

  return connection;
}

/**
 * Closes the database connection gracefully
 */
async function closeConnection(): Promise<void> {
  if (connection?.client) {
    try {
      logger.info("Closing database connection...");
      connection.client.close();
      connection.isConnected = false;
      connection = null;
      logger.info("Database connection closed successfully");
    } catch (error) {
      logger.error("Error closing database connection:", error);
    }
  }
}

// Main database export - gets connection lazily
// Using Proxy to defer connection until first use
type DrizzleDb = ReturnType<typeof drizzle>;

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const db = new Proxy<DrizzleDb>({} as DrizzleDb, {
  get(_target, prop: string | symbol) {
    const connection = getConnection();
    if (typeof prop === "string" && prop in connection.db) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      return connection.db[prop as keyof DrizzleDb];
    }
    return undefined;
  },
});

export default db;
export type Database = typeof db;

// Handle cleanup on process exit
process.on("beforeExit", () => {
  closeConnection().catch((error) => {
    logger.error("Error during database cleanup:", error);
  });
});

process.on("SIGINT", () => {
  closeConnection().catch((error) => {
    logger.error("Error during database cleanup on SIGINT:", error);
  });
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeConnection().catch((error) => {
    logger.error("Error during database cleanup on SIGTERM:", error);
  });
  process.exit(0);
});
