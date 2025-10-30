import React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

export default function PlaylistPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/playlist" });
  const playlistId = search.playlistId as string | undefined;

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

  const data = query.data as any | null;
  const title = data?.title || playlistId || "Playlist";
  let thumb = data?.thumbnailPath ? `local-file://${data.thumbnailPath}` : data?.thumbnailUrl || null;
  if (typeof thumb === "string" && thumb.includes("no_thumbnail")) {
    thumb = null as any;
  }

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
                {thumb ? (
                  <img src={thumb} alt={title} className="w-48 aspect-video rounded object-cover" />
                ) : (
                  <div className="w-48 aspect-video rounded bg-muted" />
                )}
                <div className="flex-1 space-y-2">
                  {data?.description && (
                    <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-5">
                      {data.description}
                    </p>
                  )}
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    {typeof data?.itemCount === "number" && <span>{data.itemCount} items</span>}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2"
                      onClick={handleRefresh}
                      disabled={query.isFetching || isRefreshing}
                    >
                      {query.isFetching || isRefreshing ? "Refreshing…" : "Refresh"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(data?.videos || []).map((v: any) => {
                  let vThumb = v.thumbnailPath ? `local-file://${v.thumbnailPath}` : v.thumbnailUrl;
                  if (typeof vThumb === "string" && vThumb.includes("no_thumbnail")) {
                    vThumb = null as any;
                  }
                  return (
                    <div key={v.videoId} className="rounded-lg border p-3 space-y-2">
                      {vThumb ? (
                        <img
                          src={vThumb}
                          alt={v.title}
                          className="w-full aspect-video rounded object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-full aspect-video rounded bg-muted" />
                      )}
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
                          onClick={() =>
                            navigate({ to: "/player", search: { videoId: v.videoId } })
                          }
                        >
                          Open
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => trpcClient.utils.openExternalUrl.mutate({ url: v.url })}
                        >
                          Watch on YouTube
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


