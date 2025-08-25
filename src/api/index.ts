import { t } from "./trpc";
import { utilsRouter } from "./routers/utils";
import { windowRouter } from "./routers/window";

// Create the root router
export const router = t.router({
  utils: utilsRouter,

  window: windowRouter,
});

// Export type router type signature
export type AppRouter = typeof router;
