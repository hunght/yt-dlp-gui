import { logger } from "./logger";

const tvDebugEnabled = process.env.EXPO_PUBLIC_TV_DEBUG_LOGS === "1";

export function tvDebugInfo(message: string, context?: Record<string, unknown>) {
  if (!tvDebugEnabled) {
    return;
  }

  logger.info(message, context);
}

export function isTVDebugEnabled() {
  return tvDebugEnabled;
}
