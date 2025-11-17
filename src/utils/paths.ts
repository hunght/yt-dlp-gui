import { app } from "electron";
import path from "path";

const resolveDevDatabasePath = (): string => path.resolve(process.cwd(), "local.db");

export const getDatabasePath = (): string => {
  const isPackaged = Boolean(app?.isPackaged);
  const forceDevDb = process.env.LEARNIFYTUBE_FORCE_DEV_DB === "true";
  const shouldUseDevDb = forceDevDb || !isPackaged;

  if (shouldUseDevDb) {
    return `file:${resolveDevDatabasePath()}`;
  }

  const userDataDir = app?.getPath("userData") ?? process.cwd();
  return `file:${path.join(userDataDir, "local.db")}`;
};
