import { t } from "./trpc";
import { utilsRouter } from "@/api/routers/utils";
import { windowRouter } from "@/api/routers/window";

// Create the root router
export const router = t.router({
  utils: utilsRouter,
  window: windowRouter,
});

// Export type router type signature
export type AppRouter = typeof router;
