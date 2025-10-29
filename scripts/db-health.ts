#!/usr/bin/env tsx
// Use resilient imports; fallback to inline health check if helpers unavailable
import * as DbInit from "../src/api/db/init";
import * as Paths from "../src/utils/paths";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";

async function main() {
  try {
    const getDatabaseHealth = (DbInit as any).getDatabaseHealth;
    let health: any;
    if (typeof getDatabaseHealth === "function") {
      health = await getDatabaseHealth();
    } else {
      // Fallback: compute health inline
      const getDatabasePath = (Paths as any).getDatabasePath;
      const dbPath = typeof getDatabasePath === "function" ? getDatabasePath() : "file:local.db";
      const client = createClient({ url: dbPath, authToken: "" });
      const db = drizzle(client);

      try {
        await db.run(sql`SELECT 1`);
        const integrityRes = await db.all(sql`PRAGMA integrity_check`);
        const integrityOk = (integrityRes?.[0] as any)?.integrity_check === "ok";
        const versionRes = await db.all(sql`SELECT sqlite_version() as version`);
        const version = ((versionRes?.[0] as any)?.version as string) || null;
        let lastMigration: string | null = null;
        try {
          const migrationRes = await db.all(sql`
            SELECT hash FROM __drizzle_migrations
            ORDER BY created_at DESC
            LIMIT 1
          `);
          lastMigration = ((migrationRes?.[0] as any)?.hash as string) || null;
        } catch {}

        // Size check
        const fs = await import("fs");
        const size = fs.existsSync(dbPath.replace("file:", ""))
          ? fs.statSync(dbPath.replace("file:", "")).size
          : 0;

        health = {
          connected: true,
          integrityOk,
          version,
          size,
          lastMigration,
        };
      } finally {
        client.close();
      }
    }
    console.log("Database Health Check:");
    console.log("=====================");
    console.log(`Connected: ${health.connected ? "✅" : "❌"}`);
    console.log(`Integrity: ${health.integrityOk ? "✅" : "❌"}`);
    console.log(`SQLite Version: ${health.version || "Unknown"}`);
    console.log(`Database Size: ${Math.round(health.size / 1024)} KB`);
    console.log(`Last Migration: ${health.lastMigration || "None"}`);

    if (!health.connected || !health.integrityOk) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Health check failed:", error);
    process.exit(1);
  }
}

main();
