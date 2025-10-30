import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SubscriptionsPage() {
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["subscriptions", { limit: 60 }],
    queryFn: async () => {
      return await trpcClient.ytdlp.listRecentVideos.query({ limit: 60 });
    },
    staleTime: 60_000,
  });

  const videos = (query.data || []) as any[];

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
                let thumb = v.thumbnailPath ? `local-file://${v.thumbnailPath}` : v.thumbnailUrl;
                if (typeof thumb === "string" && thumb.includes("no_thumbnail")) thumb = null as any;
                return (
                  <div key={v.videoId} className="rounded-lg border p-3 space-y-2">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={v.title}
                        className="w-full aspect-video rounded object-cover"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    ) : (
                      <div className="w-full aspect-video rounded bg-muted" />
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
                      <Button size="sm" className="flex-1" onClick={() => navigate({ to: "/player", search: { videoId: v.videoId } })}>
                        Open
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => trpcClient.utils.openExternalUrl.mutate({ url: v.url })}>
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


