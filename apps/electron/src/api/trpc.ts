import { initTRPC } from "@trpc/server";
import { logger } from "../helpers/logger";
import db from "./db";

// Create context for each request
export const createContext = async () => {
  return {
    db,
  };
};

const t = initTRPC.context<Awaited<ReturnType<typeof createContext>>>().create();

// Create middleware
const loggerMiddleware = t.middleware(async ({ path, type, next }) => {
  const start = Date.now();

  const result = await next();

  const durationMs = Date.now() - start;
  if (result.ok) {
    logger.debug(`[tRPC] ${type} ${path} completed`, {
      durationMs,
      type,
      path,
    });
  } else {
    logger.error(`[tRPC] ${type} ${path} failed`, {
      durationMs,
      type,
      path,
      error: result.error,
    });
  }

  return result;
});

// Export procedures that include the logger middleware
export const publicProcedure = t.procedure.use(loggerMiddleware);
export { t };
