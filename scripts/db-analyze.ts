#!/usr/bin/env tsx
import { analyze } from "../src/api/db/utils";

async function main() {
  try {
    console.log("📊 Starting database analysis...");
    const success = await analyze();

    if (success) {
      console.log("✅ Analysis completed successfully");
    } else {
      console.log("❌ Analysis failed");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Analysis failed:", error);
    process.exit(1);
  }
}

main();
