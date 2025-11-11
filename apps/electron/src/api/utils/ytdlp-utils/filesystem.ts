import fs from "node:fs";

export const ensureDir = async (p: string): Promise<void> => {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {
    // Ignore errors
  }
};
