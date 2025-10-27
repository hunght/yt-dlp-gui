import { createRoute } from "@tanstack/react-router";
import { RootRoute } from "./__root";
import SettingsPage from "@/pages/settings-page/SettingsPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";


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

export const rootTree = RootRoute.addChildren([
  DashboardRoute,
  SettingsRoute,

  LogsRoute,
]);
