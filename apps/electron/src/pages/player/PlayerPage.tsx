import React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

export default function PlayerPage() {
  const navigate = useNavigate();
  // Use TanStack Router's useSearch instead of window.location.search
  const search = useSearch({ from: "/player" });
  const videoId = search.videoId as string | undefined;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["video-playback", videoId],
    queryFn: async () => {
      if (!videoId) return null;
      return await trpcClient.ytdlp.getVideoPlayback.query({ videoId });
    },
    enabled: !!videoId,
    refetchInterval: (q) => {
      const status = (q.state.data as any)?.status as string | undefined;
      if (!status) return false;
      return ["downloading", "queued", "paused"].includes(status) ? 1500 : false;
    },
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

  // Start download via Queue Router (same pattern as Dashboard)
  const startDownloadMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing videoId");
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      return await trpcClient.queue.addToQueue.mutate({ urls: [url] });
    },
    onSuccess: () => {
      // Trigger immediate refetch to show status/progress
      queryClient.invalidateQueries({ queryKey: ["video-playback", videoId] });
    },
  });

  const statusText = (status?: string | null, progress?: number | null) => {
    if (!status) return null;
    switch (status) {
      case "completed":
        return "Downloaded";
      case "downloading":
        return `Downloading ${progress ?? 0}%`;
      case "queued":
        return "In Queue";
      case "failed":
        return "Failed";
      case "paused":
        return "Paused";
      default:
        return status;
    }
  };

  // Auto-start download once if file is missing and not already downloading
  const autoStartedRef = React.useRef(false);
  React.useEffect(() => {
    if (!videoId) return;
    if (filePath) return; // We already have the file

    const st = (data?.status as string | undefined) || undefined;
    const isActive = st && ["downloading", "queued", "paused"].includes(st);

    if (!isActive && !autoStartedRef.current) {
      autoStartedRef.current = true;
      startDownloadMutation.mutate();
    }
  }, [videoId, filePath, data?.status, startDownloadMutation]);

  // When status flips to completed but filePath not yet populated, force a refresh once
  const completionRefetchRef = React.useRef(false);
  React.useEffect(() => {
    if (!videoId) return;
    if (filePath) return;
    if ((data?.status as string | undefined) === "completed" && !completionRefetchRef.current) {
      completionRefetchRef.current = true;
      queryClient.invalidateQueries({ queryKey: ["video-playback", videoId] });
    }
  }, [data?.status, filePath, videoId, queryClient]);

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
            <div className="space-y-3">
              <Alert>
                <AlertTitle>File not available</AlertTitle>
                <AlertDescription>
                  The video has no downloaded file yet. {data?.status ? "Current status shown below." : "Start a download to fetch it."}
                </AlertDescription>
              </Alert>

              {/* Show progress if any */}
              {data?.status && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status: {data.status}</span>
                    <span className="font-medium">{data.progress ?? 0}%</span>
                  </div>
                  <Progress
                    value={data.progress ?? 0}
                    className="h-2"
                    indicatorClassName={
                      data.status === "completed"
                        ? "bg-green-500"
                        : data.status === "failed"
                        ? "bg-red-500"
                        : "bg-blue-500"
                    }
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => startDownloadMutation.mutate()}
                  disabled={startDownloadMutation.isPending || ["downloading", "queued"].includes((data?.status as any) || "")}
                >
                  {startDownloadMutation.isPending
                    ? "Starting..."
                    : ["downloading", "queued"].includes((data?.status as any) || "")
                    ? statusText(data?.status, data?.progress)
                    : "Download video"}
                </Button>
                {videoId && (
                  <Button
                    variant="outline"
                    onClick={() => trpcClient.utils.openExternalUrl.mutate({ url: `https://www.youtube.com/watch?v=${videoId}` })}
                  >
                    Open on YouTube
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <video
                key={filePath}
                src={toLocalFileUrl(filePath)}
                autoPlay
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
