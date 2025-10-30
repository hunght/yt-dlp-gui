import { spawn } from "node:child_process";
import { logger } from "@/helpers/logger";

export const runYtDlpJson = async (binPath: string, url: string): Promise<any> => {
  const metaJson = await new Promise<string>((resolve, reject) => {
    const proc = spawn(binPath, ["-J", url], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err || `yt-dlp -J exited with code ${code}`));
    });
  });
  return JSON.parse(metaJson);
};

export const runYtDlpFlatPlaylist = async (binPath: string, url: string): Promise<any> => {
  const json = await new Promise<string>((resolve, reject) => {
    const proc = spawn(binPath, ["-J", "--flat-playlist", url], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err || `yt-dlp exited ${code}`));
    });
  });
  return JSON.parse(json);
};

export const parseProgressLine = (line: string): number | null => {
  // Typical line: "[download]  12.3% of ..."
  const match = line.match(/(\d+(?:\.\d+)?)%/);
  if (match) {
    return Math.min(100, Math.max(0, Math.round(parseFloat(match[1]))));
  }
  return null;
};

export const extractMergedFilePath = (line: string): string | null => {
  const m = line.match(/Merging formats into \"(.+?)\"/);
  return m ? m[1] : null;
};
