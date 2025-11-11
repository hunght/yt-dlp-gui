import React, { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Search, Play, Clock, Eye } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";

export default function PlaylistsPage(): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState("");
  const [limit, setLimit] = useState(100);

  const playlistsQuery = useQuery({
    queryKey: ["playlists", "all", limit],
    queryFn: () => trpcClient.playlists.listAll.query({ limit }),
    refetchOnWindowFocus: false,
  });

  const updatePlaylistViewMutation = useMutation({
    mutationFn: (playlistId: string) => trpcClient.playlists.updateView.mutate({ playlistId }),
  });

  const filteredPlaylists = useMemo(() => {
    if (!playlistsQuery.data) return [];
    if (!searchQuery.trim()) return playlistsQuery.data;

    const query = searchQuery.toLowerCase();
    return playlistsQuery.data.filter(
      (playlist) =>
        playlist.title.toLowerCase().includes(query) ||
        playlist.channelTitle?.toLowerCase().includes(query)
    );
  }, [playlistsQuery.data, searchQuery]);

  const handleRefresh = () => {
    playlistsQuery.refetch();
  };

  const handlePlaylistClick = (playlistId: string) => {
    updatePlaylistViewMutation.mutate(playlistId);
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${seconds}s`;
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Playlists</h1>
        <Button
          onClick={handleRefresh}
          disabled={playlistsQuery.isRefetching}
          size="sm"
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${playlistsQuery.isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Playlists</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by playlist or channel name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {searchQuery && (
              <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              All Playlists {filteredPlaylists.length > 0 && `(${filteredPlaylists.length})`}
            </CardTitle>
            {playlistsQuery.data && playlistsQuery.data.length >= limit && (
              <Button variant="outline" size="sm" onClick={() => setLimit((prev) => prev + 50)}>
                Load More
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {playlistsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-4">
                  <div className="h-24 w-40 animate-pulse rounded bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredPlaylists.length > 0 ? (
            <div className="space-y-4">
              {filteredPlaylists.map((playlist) => {
                const hasWatchHistory = (playlist.viewCount ?? 0) > 0;
                const progress =
                  playlist.itemCount && playlist.currentVideoIndex
                    ? Math.round((playlist.currentVideoIndex / playlist.itemCount) * 100)
                    : 0;

                return (
                  <div
                    key={playlist.playlistId}
                    className="group flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-accent"
                  >
                    {/* Thumbnail */}
                    <Link
                      to="/playlist"
                      search={{ playlistId: playlist.playlistId }}
                      onClick={() => handlePlaylistClick(playlist.playlistId)}
                      className="relative flex-shrink-0"
                    >
                      <div className="relative">
                        <Thumbnail
                          thumbnailPath={playlist.thumbnailPath}
                          thumbnailUrl={playlist.thumbnailUrl}
                          alt={playlist.title}
                          className="h-24 w-40 rounded object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center rounded bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                          <Play className="h-8 w-8 text-white" />
                        </div>
                      </div>
                      {playlist.itemCount && (
                        <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white">
                          {playlist.itemCount} videos
                        </div>
                      )}
                    </Link>

                    {/* Content */}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <Link
                          to="/playlist"
                          search={{ playlistId: playlist.playlistId }}
                          onClick={() => handlePlaylistClick(playlist.playlistId)}
                          className="font-semibold hover:text-primary"
                        >
                          {playlist.title}
                        </Link>
                        {playlist.channelTitle && playlist.channelId && (
                          <Link
                            to="/channel"
                            search={{ channelId: playlist.channelId }}
                            className="block text-sm text-muted-foreground hover:text-primary"
                          >
                            {playlist.channelTitle}
                          </Link>
                        )}
                      </div>

                      {playlist.description && (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {playlist.description}
                        </p>
                      )}

                      {/* Stats */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {hasWatchHistory && (
                          <>
                            <div className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              <span>{playlist.viewCount} views</span>
                            </div>
                            {playlist.totalWatchTimeSeconds &&
                              playlist.totalWatchTimeSeconds > 0 && (
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>
                                    {formatDuration(playlist.totalWatchTimeSeconds)} watched
                                  </span>
                                </div>
                              )}
                            {progress > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {progress}% complete
                              </Badge>
                            )}
                          </>
                        )}
                        {playlist.lastViewedAt && (
                          <span>
                            Last viewed: {new Date(playlist.lastViewedAt).toLocaleDateString()}
                          </span>
                        )}
                        {playlist.lastFetchedAt && (
                          <span>
                            Updated: {new Date(playlist.lastFetchedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {/* Progress bar */}
                      {hasWatchHistory && progress > 0 && (
                        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                      <Link
                        to="/playlist"
                        search={{ playlistId: playlist.playlistId }}
                        onClick={() => handlePlaylistClick(playlist.playlistId)}
                      >
                        <Button size="sm" variant="outline" className="w-full">
                          <Play className="mr-2 h-4 w-4" />
                          {hasWatchHistory && progress > 0 ? "Continue" : "Play"}
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : searchQuery ? (
            <div className="py-8 text-center text-muted-foreground">
              No playlists found matching "{searchQuery}"
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No playlists yet. Playlists from channels will appear here.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics Card */}
      {playlistsQuery.data && playlistsQuery.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total Playlists</p>
                <p className="text-2xl font-bold">{playlistsQuery.data.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total Videos</p>
                <p className="text-2xl font-bold">
                  {playlistsQuery.data.reduce((sum, pl) => sum + (pl.itemCount || 0), 0)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Watched Playlists</p>
                <p className="text-2xl font-bold">
                  {playlistsQuery.data.filter((pl) => (pl.viewCount ?? 0) > 0).length}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total Watch Time</p>
                <p className="text-2xl font-bold">
                  {formatDuration(
                    playlistsQuery.data.reduce(
                      (sum, pl) => sum + (pl.totalWatchTimeSeconds || 0),
                      0
                    )
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
