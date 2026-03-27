#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function parseArgs(argv) {
  const args = {
    task: "",
    completionPromise: "DONE",
    maxIterations: 20,
    runner: "codex exec",
    stateFile: ".codex/ralph-loop.state.json",
    intervalMs: 0,
  };

  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--completion-promise") {
      args.completionPromise = argv[i + 1] || args.completionPromise;
      i += 1;
      continue;
    }
    if (token === "--max-iterations") {
      const parsed = Number.parseInt(argv[i + 1] || "", 10);
      if (Number.isFinite(parsed) && parsed > 0) args.maxIterations = parsed;
      i += 1;
      continue;
    }
    if (token === "--runner") {
      args.runner = argv[i + 1] || args.runner;
      i += 1;
      continue;
    }
    if (token === "--state-file") {
      args.stateFile = argv[i + 1] || args.stateFile;
      i += 1;
      continue;
    }
    if (token === "--interval-ms") {
      const parsed = Number.parseInt(argv[i + 1] || "", 10);
      if (Number.isFinite(parsed) && parsed >= 0) args.intervalMs = parsed;
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    positionals.push(token);
  }
  args.task = positionals.join(" ").trim();
  return args;
}

function usage() {
  console.log(
    [
      "Usage:",
      '  npm run ralph-loop -- "Your task" [--completion-promise "DONE"] [--max-iterations 20]',
      "",
      "Options:",
      "  --completion-promise  Completion marker to stop the loop",
      "  --max-iterations      Max iteration count (default: 20)",
      '  --runner              Runner command prefix (default: "codex exec")',
      "  --state-file          PID state file path for cancellation",
      "  --interval-ms         Wait time between iterations (default: 0)",
      "",
      "Cancel running loop from another shell:",
      "  npm run cancel-ralph",
    ].join("\n"),
  );
}

function quoteForShell(input) {
  return `'${String(input).replace(/'/g, `'\\''`)}'`;
}

function mkdirpForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeState(stateFile, state) {
  mkdirpForFile(stateFile);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
}

function removeState(stateFile) {
  try {
    fs.unlinkSync(stateFile);
  } catch (_err) {
    // no-op
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(command) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: ["inherit", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function includesMarker(output, marker) {
  const normalized = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return normalized.includes(marker.trim());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  if (!args.task) {
    usage();
    process.exit(1);
  }

  const stateFile = path.resolve(process.cwd(), args.stateFile);
  const state = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    task: args.task,
    maxIterations: args.maxIterations,
    completionPromise: args.completionPromise,
    stateFile,
  };
  writeState(stateFile, state);

  process.on("SIGINT", () => {
    removeState(stateFile);
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    removeState(stateFile);
    process.exit(143);
  });

  let previousOutput = "";
  for (let i = 1; i <= args.maxIterations; i += 1) {
    console.log(`\n=== ralph-loop iteration ${i}/${args.maxIterations} ===`);
    const prompt = [
      args.task,
      "",
      `If the task is complete, reply with exactly "${args.completionPromise}" on a single line.`,
      previousOutput
        ? `Previous iteration output:\n${previousOutput.slice(-5000)}\n\nContinue from this state.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const command = `${args.runner} ${quoteForShell(prompt)}`;
    const result = await runCommand(command);
    const output = `${result.stdout}\n${result.stderr}`;
    previousOutput = output;

    if (includesMarker(output, args.completionPromise)) {
      console.log(`\nCompletion promise "${args.completionPromise}" observed. Loop finished.`);
      removeState(stateFile);
      process.exit(0);
    }

    if (i < args.maxIterations && args.intervalMs > 0) {
      await sleep(args.intervalMs);
    }
  }

  console.error(
    `\nReached max iterations (${args.maxIterations}) without "${args.completionPromise}".`,
  );
  removeState(stateFile);
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
