#!/usr/bin/env tsx
import { getConnectionStats } from "../src/api/db/index";

async function main() {
  try {
    const stats = getConnectionStats();
    console.log("Database Connection Status:");
    console.log("==========================");
    console.log(`Connected: ${stats.isConnected ? "✅" : "❌"}`);
    console.log(`Database Path: ${stats.dbPath}`);
    console.log(`Last Health Check: ${stats.lastHealthCheck || "Never"}`);
  } catch (error) {
    console.error("Status check failed:", error);
    process.exit(1);
  }
}

main();
