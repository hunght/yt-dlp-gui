import { t } from "./trpc";
import { utilsRouter } from "./routers/utils";
import { windowRouter } from "./routers/window";
import { youtubeRouter } from "./routers/youtube";

// Create the root router
export const router = t.router({
  utils: utilsRouter,
  window: windowRouter,
  youtube: youtubeRouter,
});

// Export type router type signature
export type AppRouter = typeof router;
