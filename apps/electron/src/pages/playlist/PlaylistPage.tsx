import React from "react";
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

export default function PlaylistPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/playlist" });
  const playlistId = search.playlistId as string | undefined;
  const queryClient = useQueryClient();

  const [currentVideoIndex, setCurrentVideoIndex] = React.useState(0);

  const query = useQuery({
    queryKey: ["playlist-details", playlistId],
    queryFn: async () => {
      if (!playlistId) return null;
      return await trpcClient.ytdlp.getPlaylistDetails.query({ playlistId });
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
      trpcClient.ytdlp.updatePlaylistPlayback.mutate({
        playlistId: playlistId!,
        currentVideoIndex: videoIndex,
        watchTimeSeconds: watchTime,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ytdlp", "all-playlists"] });
    },
  });

  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    if (!playlistId || isRefreshing) return;
    try {
      setIsRefreshing(true);
      await trpcClient.ytdlp.getPlaylistDetails.query({ playlistId, forceRefresh: true });
      await query.refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePlayAll = () => {
    if (!data?.videos || data.videos.length === 0) {
      toast.error("No videos in playlist");
      return;
    }
    // Start from saved position or beginning
    const startIndex = data.currentVideoIndex || 0;
    const video = data.videos[startIndex];
    if (video) {
      setCurrentVideoIndex(startIndex);
      navigate({ to: "/player", search: { videoId: video.videoId } });
    }
  };

  const handlePlayVideo = (videoIndex: number) => {
    setCurrentVideoIndex(videoIndex);
    updatePlaybackMutation.mutate({ videoIndex });
    const video = data?.videos[videoIndex];
    if (video) {
      navigate({ to: "/player", search: { videoId: video.videoId } });
    }
  };

  const data = query.data as any | null;
  const title = data?.title || playlistId || "Playlist";

  const progress = data?.itemCount && data?.currentVideoIndex
    ? Math.round((data.currentVideoIndex / data.itemCount) * 100)
    : 0;

  return (
    <div className="container mx-auto space-y-6 p-6">

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
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
              <div className="flex gap-4 items-start">
                {typeof data?.thumbnailUrl === "string" && data.thumbnailUrl.includes("no_thumbnail") ? (
                  <div className="w-48 aspect-video rounded bg-muted" />
                ) : (
                  <Thumbnail
                    thumbnailPath={data?.thumbnailPath}
                    thumbnailUrl={data?.thumbnailUrl}
                    alt={title}
                    className="w-48 aspect-video rounded object-cover"
                  />
                )}
                <div className="flex-1 space-y-2">
                  {data?.description && (
                    <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-5">
                      {data.description}
                    </p>
                  )}
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    {typeof data?.itemCount === "number" && <span>{data.itemCount} items</span>}
                    {progress > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {progress}% complete
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={handlePlayAll}
                      className="flex items-center gap-2"
                    >
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(data?.videos || []).map((v: any, index: number) => {
                  const isCurrentVideo = index === (data?.currentVideoIndex || 0);
                  return (
                    <div
                      key={v.videoId}
                      className={`rounded-lg border p-3 space-y-2 ${
                        isCurrentVideo ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <div className="relative">
                        <Thumbnail
                          thumbnailPath={v.thumbnailPath}
                          thumbnailUrl={v.thumbnailUrl}
                          alt={v.title}
                          className="w-full aspect-video rounded object-cover"
                        />
                        {isCurrentVideo && (
                          <div className="absolute top-2 right-2">
                            <Badge variant="default" className="flex items-center gap-1">
                              <ListIcon className="h-3 w-3" />
                              Current
                            </Badge>
                          </div>
                        )}
                        <div className="absolute bottom-2 left-2 text-xs text-white bg-black/70 px-1.5 py-0.5 rounded">
                          #{index + 1}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-medium line-clamp-2">{v.title}</div>
                        <div className="text-xs text-muted-foreground flex gap-3">
                          {typeof v.durationSeconds === "number" && (
                            <span>{Math.round(v.durationSeconds / 60)} min</span>
                          )}
                          {typeof v.viewCount === "number" && (
                            <span>{v.viewCount.toLocaleString()} views</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handlePlayVideo(index)}
                        >
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


