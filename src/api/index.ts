import { t } from "./trpc";
import { utilsRouter } from "./routers/utils";
import { windowRouter } from "./routers/window";
import { youtubeRouter } from "./routers/youtube";
import { downloadRouter } from "./routers/download";

// Create the root router
export const router = t.router({
  utils: utilsRouter,
  window: windowRouter,
  youtube: youtubeRouter,
  download: downloadRouter,
});

// Export type router type signature
export type AppRouter = typeof router;
