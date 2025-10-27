import { t } from "./trpc";
import { utilsRouter } from "@/api/routers/utils";
import { windowRouter } from "@/api/routers/window";
import { youtubeRouter } from "@/api/routers/youtube";
import { downloadRouter } from "@/api/routers/download/index";

// Create the root router
export const router = t.router({
  utils: utilsRouter,
  window: windowRouter,
  youtube: youtubeRouter,
  download: downloadRouter,
});

// Export type router type signature
export type AppRouter = typeof router;
