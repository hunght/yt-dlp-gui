#!/usr/bin/env tsx
// Standalone status check: create a direct connection to avoid ESM interop issues
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import * as Paths from "../src/utils/paths";

async function main() {
  try {
    // Create a direct connection and run a simple query
  const getDatabasePath = (Paths as any).getDatabasePath;
  const dbPath = typeof getDatabasePath === "function" ? getDatabasePath() : "file:local.db";
    const client = createClient({ url: dbPath, authToken: "" });
    const db = drizzle(client);
    await db.run(sql`SELECT 1`);

    console.log("Database Connection Status:");
    console.log("==========================");
    console.log(`Connected: ✅`);
    console.log(`Database Path: ${dbPath}`);
    console.log(`Last Health Check: ${new Date().toISOString()}`);

    // Close client
    client.close();
  } catch (error) {
    console.error("Status check failed:", error);
    process.exit(1);
  }
}

main();
