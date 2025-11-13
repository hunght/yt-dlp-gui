#!/usr/bin/env tsx
import { vacuum } from "../src/api/db/utils";

async function main() {
  try {
    console.log("🧹 Starting database vacuum...");
    const success = await vacuum();

    if (success) {
      console.log("✅ Vacuum completed successfully");
    } else {
      console.log("❌ Vacuum failed");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Vacuum failed:", error);
    process.exit(1);
  }
}

main();
