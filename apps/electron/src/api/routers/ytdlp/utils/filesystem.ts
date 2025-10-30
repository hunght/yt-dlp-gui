import fs from "node:fs";

export const ensureDir = async (p: string) => {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {
    // Ignore errors
  }
};

export const setExecutableIfNeeded = (filePath: string) => {
  if (process.platform === "win32") return; // not needed on Windows
  try {
    fs.chmodSync(filePath, 0o755);
  } catch (e) {
    console.error("[filesystem] Failed to chmod binary", { error: String(e) });
  }
};

export const fileExists = (filePath: string): boolean => {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
};

export const readTextFile = (filePath: string): string | null => {
  try {
    return fs.readFileSync(filePath, "utf8").trim() || null;
  } catch {
    return null;
  }
};

export const writeTextFile = (filePath: string, content: string): void => {
  try {
    fs.writeFileSync(filePath, content, "utf8");
  } catch (e) {
    console.error("[filesystem] Failed to write file", { error: String(e) });
  }
};
