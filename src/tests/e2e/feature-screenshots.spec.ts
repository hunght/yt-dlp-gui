import { test, _electron as electron, ElectronApplication, Page } from "@playwright/test";
import { findLatestBuild, parseElectronApp } from "electron-playwright-helpers";
import path from "path";
import fs from "fs";

/**
 * Test file for taking comprehensive screenshots of LearnifyTube pages.
 */

let electronApp: ElectronApplication;
let page: Page;

// Create screenshots directory if it doesn't exist
const screenshotsDir = path.join(process.cwd(), "screenshots");
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

test.beforeAll(async () => {
  // Try to find latest build, fallback to dev build
  let latestBuild;
  let appInfo;

  try {
    latestBuild = findLatestBuild();
    console.log("Found latest build:", latestBuild);
    appInfo = parseElectronApp(latestBuild);
    console.log("App info main:", appInfo.main);
  } catch (error) {
    console.log("No packaged build found, using development build");
    // Use development build files
    latestBuild = ".vite/build/main.js";
    appInfo = { main: latestBuild };
  }

  // Set environment variables for testing
  process.env.CI = "e2e";
  const screenshotAppEnv = process.env.SCREENSHOT_APP_ENV ?? "production";
  process.env.NODE_ENV = screenshotAppEnv;
  process.env.LEARNIFYTUBE_FORCE_DEV_DB = "true";

  electronApp = await electron.launch({
    args: [appInfo.main],
    env: {
      ...process.env,
      NODE_ENV: screenshotAppEnv,
      LEARNIFYTUBE_FORCE_DEV_DB: "true",
      // Prevent database reset
      PRESERVE_DB: "true",
    },
  });

  // Setup event handlers for debugging
  electronApp.on("window", async (page) => {
    const filename = page.url()?.split("/").pop();
    console.log(`Window opened: ${filename}`);

    if (page.url().startsWith("devtools://")) {
      await page.close();
      return;
    }

    page.on("pageerror", (error) => {
      console.error(error);
    });
    page.on("console", (msg) => {
      console.log(msg.text());
    });
  });

  async function waitForMainWindow(app: ElectronApplication): Promise<Page> {
    console.log("Waiting for main window...");
    const windows = app.windows();
    console.log("Current windows:", windows.length);
    windows.forEach((w) => console.log("Window URL:", w.url()));

    const nonDevtoolsWindow = app.windows().find((win) => !win.url().startsWith("devtools://"));
    if (nonDevtoolsWindow) {
      console.log("Found existing main window:", nonDevtoolsWindow.url());
      return nonDevtoolsWindow;
    }

    console.log("Waiting for window event...");
    return app.waitForEvent("window", (newWindow) => {
      console.log("New window opened:", newWindow.url());
      return !newWindow.url().startsWith("devtools://");
    });
  }

  page = await waitForMainWindow(electronApp);

  // Manually inject a user ID to bypass authentication
  await page.evaluate(() => {
    const userId = Math.random().toString(36).substring(2, 15);
    localStorage.setItem("user.currentUserId", userId);
    console.log("Manually set userId in localStorage:", userId);
    window.location.reload();
  });

  // Wait for the app to fully load
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
});

test.afterAll(async () => {
  await electronApp.close();
});

test("Screenshot Dashboard", async () => {
  // App starts at Dashboard
  // Ensure we are at Dashboard by clicking the link if needed, but initially we should be there.
  // We can click just to be safe if this test runs after others (but tests run in order)
  // Since this is the first test, we assume we are at root.

  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(screenshotsDir, "dashboard.png"),
    fullPage: true,
  });
});

test("Screenshot Settings", async () => {
  // Click Settings in top bar
  console.log("Navigating to Settings...");
  await page.click('a[href="/settings"]');
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(screenshotsDir, "settings.png"),
    fullPage: true,
  });

  // Navigate back to Dashboard
  console.log("Navigating back to Dashboard...");
  await page.click('a[href="/"]');
  await page.waitForLoadState("networkidle");
});

test("Screenshot Channels", async () => {
  console.log("Navigating to Channels...");
  await page.click('a[href="/channels"]');
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(screenshotsDir, "channels.png"),
    fullPage: true,
  });

  // Navigate back to Dashboard
  console.log("Navigating back to Dashboard...");
  await page.click('a[href="/"]');
  await page.waitForLoadState("networkidle");
});

test("Download and Play Video", async () => {
  test.setTimeout(180000); // 3 mins
  const videoUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw"; // Me at the zoo (short)

  // Ensure we are at Dashboard
  console.log("Ensuring Dashboard...");
  await page.click('a[href="/"]');
  await page.waitForLoadState("networkidle");

  // Fill input
  console.log("Filling video URL...");
  await page.fill('input[placeholder*="youtube.com"]', videoUrl);

  // Wait for button to enable
  console.log("Waiting for download button to enable...");
  await page.waitForSelector('button:has-text("Download"):not([disabled])', { timeout: 10000 });

  // Wait for preview to load (optional)
  console.log("Waiting for preview...");
  try {
    await page.waitForSelector("text=Me at the zoo", { timeout: 10000 });
  } catch (e) {
    console.log("Preview timed out, proceeding to download...");
  }

  // Click download
  console.log("Clicking download...");
  await page.click('button:has-text("Download")');

  // Wait for toast or confirmation
  console.log("Waiting for download confirmation...");
  await page.waitForSelector("text=Download added to queue", { timeout: 10000 });

  // Wait for download to complete.
  // We'll wait a bit then check Channels.
  console.log("Waiting for download to complete...");
  await page.waitForTimeout(20000);

  // Go to Channels
  console.log("Navigating to Channels...");
  await page.click('a[href="/channels"]');
  await page.waitForLoadState("networkidle");

  await page.screenshot({
    path: path.join(screenshotsDir, "debug-channels-page.png"),
    fullPage: true,
  });

  // Wait for channel "jawed"
  console.log("Waiting for channel 'jawed'...");
  await page.waitForSelector("text=jawed", { timeout: 30000 });

  // Click channel
  console.log("Clicking channel...");
  await page.click("text=jawed");

  // Wait for video "Me at the zoo"
  console.log("Waiting for video...");
  await page.waitForSelector("text=Me at the zoo", { timeout: 10000 });

  // Click video to play
  console.log("Clicking video to play...");
  await page.click("text=Me at the zoo");

  // Wait for navigation to player
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Take debug screenshot of player page
  await page.screenshot({
    path: path.join(screenshotsDir, "debug-player-page.png"),
    fullPage: true,
  });

  // Verify player
  console.log("Verifying player...");
  await page.waitForSelector("video", { timeout: 20000 });

  // Wait a bit for playback
  await page.waitForTimeout(2000);

  // Take screenshot
  await page.screenshot({
    path: path.join(screenshotsDir, "player-playing.png"),
    fullPage: true,
  });
  console.log("Player screenshot taken.");
});
