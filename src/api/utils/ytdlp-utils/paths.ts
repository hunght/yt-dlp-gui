import path from "node:path";
import { app } from "electron";

export const getThumbCacheDir = (): string =>
  path.join(app.getPath("userData"), "cache", "thumbnails");
