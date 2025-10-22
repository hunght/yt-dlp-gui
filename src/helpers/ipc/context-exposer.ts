import { exposeThemeContext } from "./theme/theme-context";
import { exposeNotificationContext } from "./notification/notification-context";
import { exposeYtDlpContext } from "./ytdlp/ytdlp-context";

export default function exposeContexts() {
  exposeThemeContext();
  exposeNotificationContext();
  exposeYtDlpContext();
}
