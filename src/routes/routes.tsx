import { createRoute } from "@tanstack/react-router";
import { RootRoute } from "./__root";
import SettingsPage from "@/pages/settings-page/SettingsPage";
import YouTubeVideosPage from "@/pages/YouTubeVideosPage";
import DownloadPage from "@/pages/DownloadPage";

export const SettingsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: SettingsPage,
});

export const YouTubeVideosRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/videos",
  component: YouTubeVideosPage,
});

export const DownloadRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/download",
  component: DownloadPage,
});

export const rootTree = RootRoute.addChildren([SettingsRoute, YouTubeVideosRoute, DownloadRoute]);
