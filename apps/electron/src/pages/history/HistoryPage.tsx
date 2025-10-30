import React from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink as ExternalLinkIcon, Play, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import Thumbnail from "@/components/Thumbnail";

export default function HistoryPage() {
  const navigate = useNavigate();

  // Queue status for in-progress downloads and recent completed
  const queue = useQuery({
    queryKey: ["queue-status"],
    queryFn: async () => trpcClient.queue.getQueueStatus.query(),
    refetchInterval: 3000,
  });

  // Recently played list is now DB-backed; no local atom

  // Fetch metadata for recently played videos in parallel
  // Use DB-backed recent watched list
  const playedMeta = useQuery({
    queryKey: ["recent-watched"],
    queryFn: async () => trpcClient.ytdlp.listRecentWatched.query({ limit: 30 }),
  });

  const inProgress = queue.data?.data?.downloading || [];
  const queued = queue.data?.data?.queued || [];
  const paused = queue.data?.data?.paused || [];
  const completed = queue.data?.data?.completed || [];

  return (
    <div className="container mx-auto space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recently Played</CardTitle>
        </CardHeader>
        <CardContent>
          {playedMeta.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !playedMeta.data || playedMeta.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No playback history yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {playedMeta.data.map((v: any) => {
                const hideNoThumb = typeof v?.thumbnailUrl === "string" && v.thumbnailUrl.includes("no_thumbnail");
                return (
                  <div key={v.videoId} className="rounded-lg border p-3 space-y-2">
                    {hideNoThumb ? (
                      <div className="w-full aspect-video rounded bg-muted" />
                    ) : (
                      <Thumbnail
                        thumbnailPath={v?.thumbnailPath}
                        thumbnailUrl={v?.thumbnailUrl}
                        alt={v.title}
                        className="w-full aspect-video rounded object-cover"
                      />
                    )}
                    <div className="space-y-1">
                      <div className="text-sm font-medium line-clamp-2">{v.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{v.channelTitle || v.channelId}</div>
                      {typeof v.totalWatchSeconds === "number" && (
                        <div className="text-xs text-muted-foreground">Watched ~{Math.round(v.totalWatchSeconds / 60)} min</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {v.downloadStatus === "completed" && v.downloadFilePath ? (
                        <Button size="sm" className="flex-1" onClick={() => navigate({ to: "/player", search: { videoId: v.videoId } })}>
                          <Play className="mr-1 h-3 w-3" />
                          Play
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => trpcClient.utils.openExternalUrl.mutate({ url: v.url })}>
                          <ExternalLinkIcon className="mr-1 h-3 w-3" />
                          Watch on YouTube
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">In Progress</CardTitle>
        </CardHeader>
        <CardContent>
          {queue.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : inProgress.length === 0 && queued.length === 0 && paused.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active downloads.</p>
          ) : (
            <div className="space-y-3">
              {[...inProgress, ...queued, ...paused].map((d: any) => (
                <div key={d.id} className="flex items-center justify-between rounded border p-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="truncate">{d.title || d.url}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.status === "downloading" ? (
                      <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {d.progress || 0}%</span>
                    ) : (
                      <span className="capitalize">{d.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recently Downloaded</CardTitle>
        </CardHeader>
        <CardContent>
          {queue.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : completed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent downloads.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {completed.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between rounded border p-3">
                  <div className="min-w-0 truncate">{c.title}</div>
                  <Button size="sm" onClick={() => navigate({ to: "/player", search: { videoId: c.videoId } })}>
                    <Play className="mr-1 h-3 w-3" /> Play
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


