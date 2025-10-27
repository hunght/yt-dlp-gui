import { createRoute } from "@tanstack/react-router";
import { RootRoute } from "./__root";
import SettingsPage from "@/pages/settings-page/SettingsPage";

import DownloadPage from "@/pages/download";

export const SettingsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: SettingsPage,
});

export const DownloadRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/download",
  component: DownloadPage,
});

export const rootTree = RootRoute.addChildren([
  SettingsRoute,
  DownloadRoute,
]);
