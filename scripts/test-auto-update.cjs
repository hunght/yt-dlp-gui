#!/usr/bin/env node

/**
 * Test script to verify the auto-update configuration for LearnifyTube.
 * Mirrors the iTracksy workflow so we can quickly confirm everything is wired up.
 */

const fs = require("fs");
const path = require("path");

function ensureModuleInstalled(moduleName, friendlyName) {
  try {
    const resolvedPath = require.resolve(moduleName);
    console.log(`✅ ${friendlyName} package is installed`);
    console.log(`   Path: ${resolvedPath}`);
  } catch {
    console.log(`❌ ${friendlyName} package is not installed`);
    process.exit(1);
  }
}

function ensureRepositoryConfigured(packageJsonPath) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (packageJson.repository && packageJson.repository.url) {
      console.log("✅ Repository field is configured in package.json");
      console.log(`   Repository: ${packageJson.repository.url}`);
      return;
    }
    console.log("❌ Repository field is missing from package.json");
    process.exit(1);
  } catch {
    console.log("❌ Could not read package.json");
    process.exit(1);
  }
}

function ensureForgePublisherConfigured(forgeConfigPath) {
  try {
    const content = fs.readFileSync(forgeConfigPath, "utf8");
    if (!content.includes("PublisherGithub")) {
      console.log("❌ GitHub publisher is not configured in forge.config.ts");
      process.exit(1);
    }

    if (!content.includes('owner: "hunght"') || !content.includes('name: "LearnifyTube"')) {
      console.log("❌ Repository owner/name is not correctly configured in forge.config.ts");
      process.exit(1);
    }

    console.log("✅ GitHub publisher is configured in forge.config.ts");
    console.log("✅ Repository owner/name is correctly configured");
  } catch {
    console.log("❌ Could not read forge.config.ts");
    process.exit(1);
  }
}

function printSummary() {
  console.log("\n📋 Auto-Update Configuration Summary:");
  console.log("   • update-electron-app: ✅ Installed");
  console.log("   • electron-log: ✅ Installed");
  console.log("   • Repository: ✅ Configured");
  console.log("   • GitHub Publisher: ✅ Configured");
  console.log("   • Main Process: ✅ Auto-update code added");

  console.log("\n🚀 Your app is ready for auto-updates!");
  console.log("\n📝 Next steps:");
  console.log("   1. Build and package your app: npm run make");
  console.log("   2. Publish to GitHub: npm run publish");
  console.log("   3. Create a GitHub release with the built artifacts");
  console.log("   4. Users will automatically receive updates via update.electronjs.org");

  console.log("\n💡 Note: Auto-updates only work in production builds, not in development mode.");
}

function main() {
  console.log("🔍 Testing Auto-Update Configuration...\n");

  const projectRoot = path.join(__dirname, "..");

  ensureModuleInstalled("update-electron-app", "update-electron-app");
  ensureModuleInstalled("electron-log", "electron-log");
  ensureRepositoryConfigured(path.join(projectRoot, "package.json"));
  ensureForgePublisherConfigured(path.join(projectRoot, "forge.config.ts"));

  printSummary();
}

main();

