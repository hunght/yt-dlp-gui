import React, { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, List as ListIcon } from "lucide-react";
import { toast } from "sonner";
import Thumbnail from "@/components/Thumbnail";

export default function PlaylistPage(): React.JSX.Element {
  const navigate = useNavigate();
  const search = useSearch({ from: "/playlist" });
  const playlistId = search.playlistId;
  const queryClient = useQueryClient();
  const [_currentVideoIndex, setCurrentVideoIndex] = useState(0);

  const query = useQuery({
    queryKey: ["playlist-details", playlistId],
    queryFn: async () => {
      if (!playlistId) return null;
      return await trpcClient.playlists.getDetails.query({ playlistId });
    },
    enabled: !!playlistId,
    staleTime: Infinity,
    gcTime: Infinity,
    networkMode: "offlineFirst",
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const updatePlaybackMutation = useMutation({
    mutationFn: ({ videoIndex, watchTime }: { videoIndex: number; watchTime?: number }) =>
      trpcClient.playlists.updatePlayback.mutate({
        playlistId: playlistId!,
        currentVideoIndex: videoIndex,
        watchTimeSeconds: watchTime,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ytdlp", "all-playlists"] });
    },
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async (): Promise<void> => {
    if (!playlistId || isRefreshing) return;
    try {
      setIsRefreshing(true);
      await trpcClient.playlists.getDetails.query({ playlistId, forceRefresh: true });
      await query.refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePlayAll = (): void => {
    if (!data?.videos || data.videos.length === 0) {
      toast.error("No videos in playlist");
      return;
    }
    // Start from saved position or beginning
    const startIndex = data.currentVideoIndex || 0;
    const video = data.videos[startIndex];
    if (video && playlistId) {
      setCurrentVideoIndex(startIndex);
      navigate({
        to: "/player",
        search: {
          videoId: video.videoId,
          playlistId,
          playlistIndex: startIndex,
          title: video.title,
        },
      });
    }
  };

  const handlePlayVideo = (videoIndex: number): void => {
    setCurrentVideoIndex(videoIndex);
    updatePlaybackMutation.mutate({ videoIndex });
    const video = data?.videos[videoIndex];
    if (video && playlistId) {
      navigate({
        to: "/player",
        search: {
          videoId: video.videoId,
          playlistId,
          playlistIndex: videoIndex,
          title: video.title,
          playlistTitle: data?.title,
        },
      });
    }
  };

  const data = query.data;
  const title = data?.title ?? playlistId ?? "Playlist";

  const progress =
    data?.itemCount && data?.currentVideoIndex
      ? Math.round((data.currentVideoIndex / data.itemCount) * 100)
      : 0;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>{title}</span>
            {query.dataUpdatedAt > 0 && (
              <span className="text-xs text-muted-foreground">
                {query.isFetching ? (
                  <>
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    Refreshing…
                  </>
                ) : (
                  <>Last updated: {new Date(query.dataUpdatedAt).toLocaleString()}</>
                )}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !playlistId ? (
            <Alert>
              <AlertTitle>Missing playlist</AlertTitle>
              <AlertDescription>No playlist id provided.</AlertDescription>
            </Alert>
          ) : !data ? (
            <Alert>
              <AlertTitle>Not found</AlertTitle>
              <AlertDescription>Could not find that playlist.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                {typeof data?.thumbnailUrl === "string" &&
                data.thumbnailUrl.includes("no_thumbnail") ? (
                  <div className="aspect-video w-48 rounded bg-muted" />
                ) : (
                  <Thumbnail
                    thumbnailPath={data?.thumbnailPath}
                    thumbnailUrl={data?.thumbnailUrl}
                    alt={title}
                    className="aspect-video w-48 rounded object-cover"
                  />
                )}
                <div className="flex-1 space-y-2">
                  {data?.description && (
                    <p className="line-clamp-5 whitespace-pre-line text-sm text-muted-foreground">
                      {data.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {typeof data?.itemCount === "number" && <span>{data.itemCount} items</span>}
                    {progress > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {progress}% complete
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={handlePlayAll} className="flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      {progress > 0 ? "Continue Playlist" : "Play All"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRefresh}
                      disabled={query.isFetching || isRefreshing}
                    >
                      {query.isFetching || isRefreshing ? "Refreshing…" : "Refresh"}
                    </Button>
                  </div>
                  {progress > 0 && (
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(data?.videos ?? []).map((v, index) => {
                  const isCurrentVideo = index === (data?.currentVideoIndex || 0);
                  return (
                    <div
                      key={v.videoId}
                      className={`space-y-2 rounded-lg border p-3 ${
                        isCurrentVideo ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <div className="relative">
                        <Thumbnail
                          thumbnailPath={v.thumbnailPath}
                          thumbnailUrl={v.thumbnailUrl}
                          alt={v.title}
                          className="aspect-video w-full rounded object-cover"
                        />
                        {isCurrentVideo && (
                          <div className="absolute right-2 top-2">
                            <Badge variant="default" className="flex items-center gap-1">
                              <ListIcon className="h-3 w-3" />
                              Current
                            </Badge>
                          </div>
                        )}
                        <div className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                          #{index + 1}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="line-clamp-2 text-sm font-medium">{v.title}</div>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          {typeof v.durationSeconds === "number" && (
                            <span>{Math.round(v.durationSeconds / 60)} min</span>
                          )}
                          {typeof v.viewCount === "number" && (
                            <span>{v.viewCount.toLocaleString()} views</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={() => handlePlayVideo(index)}>
                          Play
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => trpcClient.utils.openExternalUrl.mutate({ url: v.url })}
                        >
                          YouTube
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
