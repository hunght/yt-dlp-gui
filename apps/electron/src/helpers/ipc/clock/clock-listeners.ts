import {
  CLOCK_SHOW_CHANNEL,
  CLOCK_HIDE_CHANNEL,
  CLOCK_SHOW_MAIN_CHANNEL,
} from "./clock-channels";

import { safelyRegisterListener } from "../safelyRegisterListener";
import { showClockWindow, hideClockWindow } from "../../../main/windows/clock";
import { showMainWindow } from "../../../main";
import { logger } from "../../logger";

export const addClockEventListeners = () => {
  // Show clock handler
  safelyRegisterListener(CLOCK_SHOW_CHANNEL, async (_event) => {
    try {
      showClockWindow();
      return { success: true };
    } catch (error) {
      logger.error("Failed to show clock", { error });
      throw error;
    }
  });

  // Hide clock handler
  safelyRegisterListener(CLOCK_HIDE_CHANNEL, async (_event) => {
    try {
      hideClockWindow();
      return { success: true };
    } catch (error) {
      logger.error("Failed to hide clock", { error });
      throw error;
    }
  });

  // Show main window handler
  safelyRegisterListener(CLOCK_SHOW_MAIN_CHANNEL, async (_event) => {
    try {
      showMainWindow();
      return { success: true };
    } catch (error) {
      logger.error("Failed to show main window from clock", { error });
      throw error;
    }
  });
};
