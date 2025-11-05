import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink as ExternalLinkIcon, Download, Play, Loader2 } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";
import { toast } from "sonner";

export default function SubscriptionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["subscriptions", { limit: 60 }],
    queryFn: async () => {
      return await trpcClient.watchStats.listRecentVideos.query({ limit: 60 });
    },
    staleTime: 60_000,
  });

  const videos = (query.data || []) as any[];

  const addToQueueMutation = useMutation({
    mutationFn: (url: string) => trpcClient.queue.addToQueue.mutate({ urls: [url], priority: 0 }),
    onSuccess: (result, variables) => {
      if ((result as any)?.success) {
        toast.success("Added to queue");
        // Refresh recent list to reflect status changes
        queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      } else {
        toast.error((result as any)?.message || "Failed to add to queue");
      }
    },
    onError: () => toast.error("Failed to add video to queue"),
  });

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-end">
        <div className="text-xs text-muted-foreground">
          {query.isFetching ? "Refreshing…" : query.dataUpdatedAt ? `Updated ${new Date(query.dataUpdatedAt).toLocaleTimeString()}` : ""}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent videos found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos.map((v) => {
                const hideNoThumb = typeof v.thumbnailUrl === "string" && v.thumbnailUrl.includes("no_thumbnail");
                return (
                  <div key={v.videoId} className="rounded-lg border p-3 space-y-2">
                    {hideNoThumb ? (
                      <div className="w-full aspect-video rounded bg-muted" />
                    ) : (
                      <Thumbnail
                        thumbnailPath={v.thumbnailPath}
                        thumbnailUrl={v.thumbnailUrl}
                        alt={v.title}
                        className="w-full aspect-video rounded object-cover"
                      />
                    )}
                    <div className="space-y-1">
                      <div className="text-sm font-medium line-clamp-2">{v.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{v.channelTitle || v.channelId}</div>
                      <div className="text-xs text-muted-foreground flex gap-3">
                        {typeof v.durationSeconds === "number" && <span>{Math.round(v.durationSeconds / 60)} min</span>}
                        {typeof v.viewCount === "number" && <span>{v.viewCount.toLocaleString()} views</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {v.downloadStatus === "completed" && v.downloadFilePath ? (
                        <Button size="sm" className="flex-1" onClick={() => navigate({ to: "/player", search: { videoId: v.videoId, playlistId: undefined, playlistIndex: undefined } })}>
                          <Play className="mr-1 h-3 w-3" />
                          Play
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => addToQueueMutation.mutate(`https://www.youtube.com/watch?v=${v.videoId}`)}
                          disabled={v.downloadStatus === "downloading" || v.downloadStatus === "queued"}
                        >
                          {v.downloadStatus === "downloading" || v.downloadStatus === "queued" ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              {v.downloadStatus === "queued" ? "Queued" : `Downloading ${v.downloadProgress || 0}%`}
                            </>
                          ) : (
                            <>
                              <Download className="mr-1 h-3 w-3" />
                              Download
                            </>
                          )}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => trpcClient.utils.openExternalUrl.mutate({ url: v.url })}>
                        <ExternalLinkIcon className="mr-1 h-3 w-3" />
                        Watch on YouTube
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


