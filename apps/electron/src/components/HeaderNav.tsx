import React, { useMemo, Fragment } from "react";
import { Link, useMatches } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";

interface Segment {
  name: string;
  to: string;
  search?: Record<string, unknown>;
}

export function HeaderNav(): React.JSX.Element {
  const matches = useMatches();
  const leaf = matches[matches.length - 1];
  const queryClient = useQueryClient();

  const segments = useMemo(() => {
    const path = leaf?.pathname || "/";
    const parts = path.split("/").filter(Boolean);
    const acc: Segment[] = [];

    // Get search params from leaf
    const leafSearch = leaf?.search;
    const searchParams: Record<string, unknown> | undefined =
      leafSearch && typeof leafSearch === "object" && leafSearch !== null
        ? { ...leafSearch }
        : undefined;
    const title =
      searchParams && "title" in searchParams && typeof searchParams.title === "string"
        ? searchParams.title
        : undefined;

    // Build segments
    let built = "";
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      built += `/${p}`;

      // Special handling for detail pages with title
      if (p === "playlist" && title) {
        // Add "Playlists" parent link
        acc.push({ name: "Playlists", to: "/playlists" });
        // Add current playlist title
        acc.push({
          name: title,
          to: built,
          search: searchParams,
        });
      } else if (p === "channel" && title) {
        // Add "Channels" parent link
        acc.push({ name: "Channels", to: "/channels" });
        // Add current channel name
        acc.push({
          name: title,
          to: built,
          search: searchParams,
        });
      } else if (p === "player" && title) {
        // Check if playing from a playlist
        const playlistId =
          searchParams &&
          "playlistId" in searchParams &&
          typeof searchParams.playlistId === "string"
            ? searchParams.playlistId
            : undefined;

        // Check if playing from a channel
        const channelId =
          searchParams && "channelId" in searchParams && typeof searchParams.channelId === "string"
            ? searchParams.channelId
            : undefined;

        if (playlistId) {
          // Try to get playlist title from React Query cache
          const cachedPlaylistData = queryClient.getQueryData(["playlist-details", playlistId]);
          const playlistTitle =
            cachedPlaylistData &&
            typeof cachedPlaylistData === "object" &&
            "title" in cachedPlaylistData &&
            typeof cachedPlaylistData.title === "string"
              ? cachedPlaylistData.title
              : "Playlist";

          // Playing from playlist: show playlist hierarchy
          acc.push({ name: "Playlists", to: "/playlists" });
          acc.push({
            name: playlistTitle,
            to: "/playlist",
            search: { playlistId, title: playlistTitle },
          });
          acc.push({
            name: title,
            to: built,
            search: searchParams,
          });
        } else if (channelId) {
          // Try to get channel title from React Query cache
          const cachedChannelData = queryClient.getQueryData(["ytdlp", "channel", channelId]);
          const channelTitle =
            cachedChannelData &&
            typeof cachedChannelData === "object" &&
            "channelTitle" in cachedChannelData &&
            typeof cachedChannelData.channelTitle === "string"
              ? cachedChannelData.channelTitle
              : "Channel";

          // Playing from channel: show channel hierarchy
          acc.push({ name: "Channels", to: "/channels" });
          acc.push({
            name: channelTitle,
            to: "/channel",
            search: { channelId, title: channelTitle },
          });
          acc.push({
            name: title,
            to: built,
            search: searchParams,
          });
        } else {
          // Playing standalone: show history
          acc.push({ name: "History", to: "/history" });
          acc.push({
            name: title,
            to: built,
            search: searchParams,
          });
        }
      } else {
        acc.push({ name: p.charAt(0).toUpperCase() + p.slice(1), to: built });
      }
    }

    return acc;
  }, [leaf, queryClient]);

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/70 px-4 py-2 backdrop-blur dark:bg-gray-900/70">
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <nav className="flex min-w-0 items-center gap-1 text-muted-foreground">
          <Link to="/" className="flex-shrink-0 hover:underline">
            Home
          </Link>
          {segments.map((s, i) => (
            <Fragment key={`${s.to}-${i}`}>
              <span className="flex-shrink-0">/</span>
              {i === segments.length - 1 ? (
                <span className="max-w-[200px] truncate text-foreground" title={s.name}>
                  {s.name}
                </span>
              ) : (
                <Link
                  to={s.to}
                  search={s.search}
                  className="max-w-[150px] truncate hover:underline"
                  title={s.name}
                >
                  {s.name}
                </Link>
              )}
            </Fragment>
          ))}
        </nav>
      </div>
      <RightSidebarTrigger />
    </div>
  );
}
