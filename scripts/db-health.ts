#!/usr/bin/env tsx
import { getDatabaseHealth } from "../src/api/db/init";

async function main() {
  try {
    const health = await getDatabaseHealth();
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
