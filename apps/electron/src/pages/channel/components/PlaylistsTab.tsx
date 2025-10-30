import React from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ExternalLink as ExternalLinkIcon, Loader2 } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";

interface PlaylistsTabProps {
  channelId: string;
  isActive: boolean;
}

export const PlaylistsTab: React.FC<PlaylistsTabProps> = ({ channelId, isActive }) => {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["channel-playlists", channelId],
    queryFn: () => trpcClient.ytdlp.listChannelPlaylists.query({ channelId }),
    enabled: !!channelId,
    staleTime: Infinity,
    gcTime: Infinity,
    networkMode: "offlineFirst",
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    try {
      setIsRefreshing(true);
      await trpcClient.ytdlp.listChannelPlaylists.query({ channelId, forceRefresh: true });
      await query.refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <>
      {query.dataUpdatedAt > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {query.isFetching ? (
              <>
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                Refreshing data...
              </>
            ) : (
              <>Last updated: {new Date(query.dataUpdatedAt).toLocaleString()}</>
            )}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2"
            onClick={handleRefresh}
            disabled={query.isFetching || isRefreshing}
          >
            {query.isFetching || isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      )}

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading playlists…</p>
      ) : query.data && query.data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {query.data.map((playlist: any) => {
            const playlistUrl = playlist.url ?? `https://www.youtube.com/playlist?list=${playlist.playlistId || playlist.id}`;
            const hideNoThumb = typeof playlist.thumbnailUrl === "string" && playlist.thumbnailUrl.includes("no_thumbnail");

            return (
              <div key={playlist.id} className="rounded-lg border p-4 space-y-3">
                {/* Playlist Thumbnail */}
                {hideNoThumb ? (
                  <div className="w-full aspect-video rounded bg-muted" />
                ) : (
                  <Thumbnail
                    thumbnailPath={playlist.thumbnailPath}
                    thumbnailUrl={playlist.thumbnailUrl}
                    alt={playlist.title}
                    className="w-full aspect-video rounded object-cover"
                  />
                )}

                {/* Playlist Info */}
                <div className="space-y-2">
                  <h3 className="font-medium line-clamp-2">{playlist.title}</h3>

                  {playlist.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {playlist.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {playlist.videoCount && (
                      <span>{playlist.videoCount} videos</span>
                    )}
                    {playlist.viewCount && (
                      <span>{playlist.viewCount.toLocaleString()} views</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="flex-1"
                    onClick={(e) => {
                      e.preventDefault();
                      const pid = playlist.playlistId || playlist.id;
                      if (pid) {
                        navigate({ to: "/playlist", search: { playlistId: pid } });
                      } else {
                        trpcClient.utils.openExternalUrl.mutate({ url: playlistUrl });
                      }
                    }}
                  >
                    View Playlist
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.preventDefault();
                      trpcClient.utils.openExternalUrl.mutate({ url: playlistUrl });
                    }}
                  >
                    <ExternalLinkIcon className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No playlists found.</p>
      )}
    </>
  );
};
