import React from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import Thumbnail from "@/components/Thumbnail";

export default function HistoryPage(): React.JSX.Element {
  const navigate = useNavigate();

  // Fetch metadata for recently played videos
  // Use DB-backed recent watched list
  const playedMeta = useQuery({
    queryKey: ["recent-watched"],
    queryFn: async () => trpcClient.watchStats.listRecentWatched.query({ limit: 30 }),
  });

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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {playedMeta.data.map((v) => {
                const hideNoThumb =
                  typeof v?.thumbnailUrl === "string" && v.thumbnailUrl.includes("no_thumbnail");
                return (
                  <div key={v.videoId} className="space-y-2 rounded-lg border p-3">
                    {hideNoThumb ? (
                      <div className="aspect-video w-full rounded bg-muted" />
                    ) : (
                      <Thumbnail
                        thumbnailPath={v?.thumbnailPath}
                        thumbnailUrl={v?.thumbnailUrl}
                        alt={v.title}
                        className="aspect-video w-full rounded object-cover"
                      />
                    )}
                    <div className="space-y-1">
                      <div className="line-clamp-2 text-sm font-medium">{v.title}</div>
                      <div className="line-clamp-1 text-xs text-muted-foreground">
                        {v.channelTitle || v.channelId}
                      </div>
                      {typeof v.totalWatchSeconds === "number" && (
                        <div className="text-xs text-muted-foreground">
                          Watched ~{Math.round(v.totalWatchSeconds / 60)} min
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() =>
                          navigate({
                            to: "/player",
                            search: {
                              videoId: v.videoId,
                              playlistId: undefined,
                              playlistIndex: undefined,
                              title: v.title,
                            },
                          })
                        }
                      >
                        <Play className="mr-1 h-3 w-3" />
                        Play
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
