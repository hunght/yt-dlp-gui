import path from "node:path";
import { app } from "electron";

export const getThumbCacheDir = () => path.join(app.getPath("userData"), "cache", "thumbnails");
