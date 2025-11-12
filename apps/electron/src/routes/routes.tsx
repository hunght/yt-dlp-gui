import { createRoute } from "@tanstack/react-router";
import { RootRoute } from "./__root";
import SettingsPage from "@/pages/settings-page/SettingsPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import PlayerPage from "@/pages/player/PlayerPage";
import ChannelPage from "@/pages/channel/ChannelPage";
import ChannelsPage from "@/pages/channels/ChannelsPage";
import PlaylistPage from "@/pages/playlist/PlaylistPage";
import PlaylistsPage from "@/pages/playlists/PlaylistsPage";
import LogsPage from "@/pages/logs/LogsPage";
import SubscriptionsPage from "@/pages/subscriptions/SubscriptionsPage";
import HistoryPage from "@/pages/history/HistoryPage";
import MyWordsPage from "@/pages/my-words/MyWordsPage";

const DashboardRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: DashboardPage,
});

const LogsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/logs",
  component: LogsPage,
});

const SettingsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/settings",
  component: SettingsPage,
});

const PlayerRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/player",
  component: PlayerPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      videoId: typeof search.videoId === "string" ? search.videoId : undefined,
      playlistId: typeof search.playlistId === "string" ? search.playlistId : undefined,
      playlistIndex: typeof search.playlistIndex === "number" ? search.playlistIndex : undefined,
      title: typeof search.title === "string" ? search.title : undefined,
      playlistTitle: typeof search.playlistTitle === "string" ? search.playlistTitle : undefined,
    };
  },
});

const ChannelRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/channel",
  component: ChannelPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      channelId: typeof search.channelId === "string" ? search.channelId : undefined,
      title: typeof search.title === "string" ? search.title : undefined,
    };
  },
});

const ChannelsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/channels",
  component: ChannelsPage,
});

const PlaylistRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/playlist",
  component: PlaylistPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      playlistId: typeof search.playlistId === "string" ? search.playlistId : undefined,
      title: typeof search.title === "string" ? search.title : undefined,
    };
  },
});

const PlaylistsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/playlists",
  component: PlaylistsPage,
});

const SubscriptionsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/subscriptions",
  component: SubscriptionsPage,
});

const HistoryRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/history",
  component: HistoryPage,
});

const MyWordsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/my-words",
  component: MyWordsPage,
});

export const rootTree = RootRoute.addChildren([
  DashboardRoute,
  SettingsRoute,
  LogsRoute,
  PlayerRoute,
  ChannelRoute,
  ChannelsRoute,
  PlaylistRoute,
  PlaylistsRoute,
  SubscriptionsRoute,
  HistoryRoute,
  MyWordsRoute,
]);
