#!/usr/bin/env tsx
import fs from "fs";

async function main() {
  try {
    // Simple fallback database path
    const src = process.env.NODE_ENV === "development" ? "local.db" : "local.db";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dst = `${src}.${timestamp}.manual.backup`;

    if (!fs.existsSync(src)) {
      console.log("❌ Database file not found:", src);
      process.exit(1);
    }

    fs.copyFileSync(src, dst);
    console.log("✅ Backup created:", dst);
    console.log(`📊 Size: ${Math.round(fs.statSync(dst).size / 1024)} KB`);
  } catch (error) {
    console.error("❌ Backup failed:", error);
    process.exit(1);
  }
}

main();
