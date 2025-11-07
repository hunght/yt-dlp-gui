import posthog from "posthog-js";
import { logger } from "./logger";

/**
 * Safe analytics interface that gracefully handles any PostHog errors
 */
export const analytics = {
  /**
   * Identify a user
   * @param userId User identifier
   * @param properties Additional properties
   */
  identify: (userId: string, properties?: Record<string, any>): void => {
    try {
      posthog.identify(userId, properties);
    } catch (error) {
      // Silently log analytics errors to avoid disrupting user experience
      logger.debug("[analytics] Identify error", { error });
    }
  },

  /**
   * Track a specific event
   * @param eventName Name of the event
   * @param properties Additional properties
   */
  track: (eventName: string, properties?: Record<string, any>): void => {
    try {
      posthog.capture(eventName, properties);
    } catch (error) {
      // Silently log analytics errors to avoid disrupting user experience
      logger.debug("[analytics] Track error", { eventName, error });
    }
  },

  /**
   * Track a page view
   * @param path Page path
   * @param properties Additional properties
   */
  pageView: (path: string, properties?: Record<string, any>): void => {
    try {
      posthog.capture("$pageview", {
        $current_url: path,
        view_name: path.split("/").pop() || "home",
        ...properties,
      });
    } catch (error) {
      // Silently log analytics errors to avoid disrupting user experience
      logger.debug("[analytics] PageView error", { path, error });
    }
  },

  /**
   * Update user properties
   * @param properties Properties to update
   */
  updateUserProperties: (properties: Record<string, any>): void => {
    try {
      posthog.people.set(properties);
    } catch (error) {
      // Silently log analytics errors to avoid disrupting user experience
      logger.debug("[analytics] UpdateUserProperties error", { error });
    }
  },

  /**
   * Register global properties to be sent with all events
   * @param properties Properties to register
   */
  registerGlobalProperties: (properties: Record<string, any>): void => {
    try {
      posthog.register(properties);
    } catch (error) {
      // Silently log analytics errors to avoid disrupting user experience
      logger.debug("[analytics] RegisterGlobalProperties error", { error });
    }
  },
};

// Unused analytics initialization removed
