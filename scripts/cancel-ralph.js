#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const stateFileArgIndex = process.argv.indexOf("--state-file");
const stateFileArg =
  stateFileArgIndex >= 0 && process.argv[stateFileArgIndex + 1]
    ? process.argv[stateFileArgIndex + 1]
    : ".codex/ralph-loop.state.json";
const stateFile = path.resolve(process.cwd(), stateFileArg);

function removeStateFile() {
  try {
    fs.unlinkSync(stateFile);
  } catch (_err) {
    // ignore
  }
}

if (!fs.existsSync(stateFile)) {
  console.log(`No running ralph-loop found (state file missing: ${stateFileArg}).`);
  process.exit(0);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
} catch (err) {
  console.error(`Failed to read state file: ${err.message}`);
  removeStateFile();
  process.exit(1);
}

if (!parsed || typeof parsed.pid !== "number") {
  console.error("State file does not contain a valid pid. Cleaning up.");
  removeStateFile();
  process.exit(1);
}

try {
  process.kill(parsed.pid, "SIGTERM");
  console.log(`Sent SIGTERM to ralph-loop pid ${parsed.pid}.`);
} catch (err) {
  console.error(`Unable to stop pid ${parsed.pid}: ${err.message}`);
}

removeStateFile();
