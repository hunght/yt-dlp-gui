import React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function PlayerPage() {
  const navigate = useNavigate();
  // Use TanStack Router's useSearch instead of window.location.search
  const search = useSearch({ from: "/player" });
  const videoId = search.videoId as string | undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["video-playback", videoId],
    queryFn: async () => {
      if (!videoId) return null;
      return await trpcClient.ytdlp.getVideoPlayback.query({ videoId });
    },
    enabled: !!videoId,
  });

  const filePath = data?.filePath || null;
  const toLocalFileUrl = (p: string) => `local-file://${p}`;
  const videoTitle = data?.title || data?.videoId || "Video";

  // Accumulate watch time and persist to DB periodically
  const lastTimeRef = React.useRef<number>(0);
  const accumulatedRef = React.useRef<number>(0);
  const flushTimerRef = React.useRef<any>(null);

  const handleTimeUpdate = React.useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      const el = e.currentTarget;
      const current = el.currentTime;
      const prev = lastTimeRef.current;
      if (current > prev) {
        accumulatedRef.current += current - prev;
      }
      lastTimeRef.current = current;
    },
    []
  );

  const flushProgress = React.useCallback(async () => {
    if (!data?.videoId) return;
    const delta = Math.floor(accumulatedRef.current);
    if (delta <= 0) return;
    accumulatedRef.current = 0;
    try {
      await trpcClient.ytdlp.recordWatchProgress.mutate({
        videoId: data.videoId,
        deltaSeconds: delta,
        positionSeconds: Math.floor(lastTimeRef.current || 0),
      });
    } catch {}
  }, [data?.videoId]);

  React.useEffect(() => {
    // Flush every 10 seconds
    flushTimerRef.current = setInterval(() => {
      flushProgress();
    }, 10000);
    return () => {
      clearInterval(flushTimerRef.current);
      flushProgress();
    };
  }, [flushProgress]);

  return (
    <div className="container mx-auto space-y-6 p-6">

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{videoTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !videoId ? (
            <Alert>
              <AlertTitle>Missing video</AlertTitle>
              <AlertDescription>No video id provided.</AlertDescription>
            </Alert>
          ) : !data ? (
            <Alert>
              <AlertTitle>Not found</AlertTitle>
              <AlertDescription>Could not find that video.</AlertDescription>
            </Alert>
          ) : !filePath ? (
            <Alert>
              <AlertTitle>File not available</AlertTitle>
              <AlertDescription>
                The video has no downloaded file yet. It may still be processing.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              <video
                key={filePath}
                src={toLocalFileUrl(filePath)}
                controls
                className="w-full max-h-[70vh] rounded border bg-black"
                onTimeUpdate={handleTimeUpdate}
              />
              <div className="flex gap-2">
                <a
                  href={toLocalFileUrl(filePath)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-sm"
                >
                  Open file
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
