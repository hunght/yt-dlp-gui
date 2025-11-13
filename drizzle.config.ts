import { defineConfig } from "drizzle-kit";
import { getDatabasePath } from "./src/utils/paths";

export default defineConfig({
  schema: "../../packages/database/src/schema.ts",
  out: "../../packages/database/drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: getDatabasePath(),
  },
  // These options make migrations safer
  strict: true,
  verbose: true,
});
