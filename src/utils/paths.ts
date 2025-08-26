import path from "path";

// Safely import app from electron, might not be available in non-Electron contexts
let app: any;
try {
  app = require("electron").app;
} catch {
  app = null;
}

export const getDatabasePath = () => {
  if (process.env.NODE_ENV === "development") {
    // In development
    return "file:local.db";
  }

  // In production, store in user data directory
  if (app) {
    return `file:${path.join(app.getPath("userData"), "local.db")}`;
  } else {
    // Fallback for non-Electron contexts
    return "file:local.db";
  }
};
