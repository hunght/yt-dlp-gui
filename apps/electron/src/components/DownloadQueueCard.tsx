import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Pause, Play, X, RotateCw, PlayCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { QueueStatus } from "@/services/download-queue/types";

const statusColors = {
  pending: "bg-gray-500",
  queued: "bg-blue-500",
  downloading: "bg-green-500",
  paused: "bg-yellow-500",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
  cancelled: "bg-gray-500",
} as const;

const statusLabels = {
  pending: "Pending",
  queued: "Queued",
  downloading: "Downloading",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
} as const;

export const DownloadQueueCard: React.FC = () => {
  const queryClient = useQueryClient();

  // Poll queue status every 1.5 seconds
  const { data: queueData, isLoading } = useQuery({
    queryKey: ["queue", "status"],
    queryFn: async () => {
      const result = await trpcClient.queue.getQueueStatus.query();
      return result.success ? result.data : null;
    },
    refetchInterval: 1500,
    refetchOnWindowFocus: true,
  });

  // Pause mutation
  const pauseMutation = useMutation({
    mutationFn: (downloadId: string) =>
      trpcClient.queue.pauseDownload.mutate({ downloadId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue", "status"] });
      toast.success("Download paused");
    },
    onError: (error: any) => {
      toast.error(error?.message ?? "Failed to pause download");
    },
  });

  // Resume mutation
  const resumeMutation = useMutation({
    mutationFn: (downloadId: string) =>
      trpcClient.queue.resumeDownload.mutate({ downloadId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue", "status"] });
      toast.success("Download resumed");
    },
    onError: (error: any) => {
      toast.error(error?.message ?? "Failed to resume download");
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: (downloadId: string) =>
      trpcClient.queue.cancelDownload.mutate({ downloadId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue", "status"] });
      toast.success("Download cancelled");
    },
    onError: (error: any) => {
      toast.error(error?.message ?? "Failed to cancel download");
    },
  });

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: (downloadId: string) =>
      trpcClient.queue.retryDownload.mutate({ downloadId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue", "status"] });
      toast.success("Download queued for retry");
    },
    onError: (error: any) => {
      toast.error(error?.message ?? "Failed to retry download");
    },
  });


  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Download Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading queue...</p>
        </CardContent>
      </Card>
    );
  }

  if (!queueData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Download Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load queue</p>
        </CardContent>
      </Card>
    );
  }

  const allDownloads = [
    ...queueData.downloading,
    ...queueData.queued,
    ...queueData.paused,
    ...queueData.failed,
    ...queueData.completed,
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Download Queue</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Queue Stats */}
        <div className="mb-4 grid grid-cols-4 gap-2">
          <div className="rounded-lg border p-2">
            <p className="text-xs text-muted-foreground">Downloading</p>
            <p className="text-2xl font-bold">{queueData.stats.totalActive}</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-xs text-muted-foreground">Queued</p>
            <p className="text-2xl font-bold">{queueData.stats.totalQueued}</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold">{queueData.stats.totalCompleted}</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-2xl font-bold">{queueData.stats.totalFailed}</p>
          </div>
        </div>

        {/* Download List */}
        <div className="space-y-2">
          {allDownloads.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No downloads in queue
            </p>
          ) : (
            allDownloads.map((download) => (
              <div
                key={download.id}
                className="rounded-lg border p-3 space-y-2"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {download.title || download.url}
                    </p>
                    {download.channelTitle && (
                      <p className="text-xs text-muted-foreground truncate">
                        {download.channelTitle}
                      </p>
                    )}
                  </div>
                  <Badge className={statusColors[download.status]}>
                    {statusLabels[download.status]}
                  </Badge>
                </div>

                {/* Progress bar */}
                {download.status === "downloading" && (
                  <div className="space-y-1">
                    <Progress value={download.progress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-right">
                      {download.progress}%
                    </p>
                  </div>
                )}

                {/* Error message */}
                {download.status === "failed" && download.errorMessage && (
                  <p className="text-xs text-red-500">{download.errorMessage}</p>
                )}

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-2">
                  {download.status === "completed" && download.filePath && download.videoId && (
                    <Link
                      to="/player"
                      search={{ videoId: download.videoId, playlistId: undefined, playlistIndex: undefined }}
                      className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
                    >
                      <PlayCircle className="mr-2 h-4 w-4" /> Play
                    </Link>
                  )}
                  {download.status === "downloading" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => pauseMutation.mutate(download.id)}
                      disabled={pauseMutation.isPending}
                    >
                      <Pause className="h-4 w-4" />
                    </Button>
                  )}

                  {download.status === "paused" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => resumeMutation.mutate(download.id)}
                      disabled={resumeMutation.isPending}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  )}

                  {download.status === "failed" &&
                    download.isRetryable &&
                    download.retryCount < download.maxRetries && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => retryMutation.mutate(download.id)}
                        disabled={retryMutation.isPending}
                      >
                        <RotateCw className="h-4 w-4" />
                      </Button>
                    )}

                  {["downloading", "queued", "paused"].includes(
                    download.status
                  ) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cancelMutation.mutate(download.id)}
                      disabled={cancelMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
