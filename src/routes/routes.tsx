import { createRoute } from "@tanstack/react-router";
import { RootRoute } from "./__root";
import SettingsPage from "@/pages/settings-page/SettingsPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import PlayerPage from "@/pages/player/PlayerPage";
import ChannelPage from "@/pages/channel/ChannelPage";
import LogsPage from "@/pages/logs/LogsPage";

export const DashboardRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: DashboardPage,
});

export const LogsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/logs",
  component: LogsPage,
});

export const SettingsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/settings",
  component: SettingsPage,
});

export const PlayerRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/player",
  component: PlayerPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      id: (search.id as string) || undefined,
    };
  },
});

export const ChannelRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/channel",
  component: ChannelPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      channelId: (search.channelId as string) || undefined,
    };
  },
});

export const rootTree = RootRoute.addChildren([
  DashboardRoute,
  SettingsRoute,
  LogsRoute,
  PlayerRoute,
  ChannelRoute,
]);
