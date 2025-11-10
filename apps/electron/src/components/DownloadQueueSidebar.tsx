import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Pause, Play, X, RotateCw, PlayCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

export const DownloadQueueSidebar: React.FC = () => {
  const queryClient = useQueryClient();

  // Poll queue status - smart polling based on download states
  const { data: queueData, isLoading } = useQuery({
    queryKey: ["queue", "status"],
    queryFn: async () => {
      const result = await trpcClient.queue.getQueueStatus.query();
      return result.success ? result.data : null;
    },
    // Adaptive polling: Fast for active downloads, slower for completed/failed, stop when idle
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1500; // Poll initially until we get data

      const hasActiveDownloads =
        data.downloading.length > 0 || data.queued.length > 0 || data.paused.length > 0;

      // Fast polling for active downloads
      if (hasActiveDownloads) return 1500;

      // Slower polling if there are completed/failed downloads (to catch final updates)
      const hasRecentDownloads = data.completed.length > 0 || data.failed.length > 0;
      if (hasRecentDownloads) return 5000; // Poll every 5 seconds

      // Stop polling when completely idle
      return false;
    },
    refetchOnWindowFocus: true,
  });

  // Pause mutation
  const pauseMutation = useMutation({
    mutationFn: (downloadId: string) => trpcClient.queue.pauseDownload.mutate({ downloadId }),
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
    mutationFn: (downloadId: string) => trpcClient.queue.resumeDownload.mutate({ downloadId }),
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
    mutationFn: (downloadId: string) => trpcClient.queue.cancelDownload.mutate({ downloadId }),
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
    mutationFn: (downloadId: string) => trpcClient.queue.retryDownload.mutate({ downloadId }),
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
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading queue...</p>
      </div>
    );
  }

  if (!queueData) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Failed to load queue</p>
      </div>
    );
  }

  // Combine all downloads and sort by most recent activity
  const allDownloads = [
    ...queueData.downloading,
    ...queueData.queued,
    ...queueData.paused,
    ...queueData.failed,
    ...queueData.completed,
  ].sort((a, b) => {
    // Get the most recent timestamp for each download
    const getRecentTime = (download: typeof a) => {
      const times = [
        download.startedAt,
        download.updatedAt,
        download.completedAt,
        download.pausedAt,
        download.addedAt,
      ].filter((t): t is number => t !== null);

      return times.length > 0 ? Math.max(...times) : 0;
    };

    const timeA = getRecentTime(a);
    const timeB = getRecentTime(b);

    // Sort by most recent first (descending)
    return timeB - timeA;
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-tracksy-gold/20 pb-3 dark:border-tracksy-gold/10">
        <h2 className="text-base font-semibold text-tracksy-blue dark:text-white">
          Download Queue
        </h2>
      </div>

      {/* Queue Stats - 2x2 Grid */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-md border border-tracksy-gold/20 bg-white/50 p-2 dark:border-tracksy-gold/10 dark:bg-gray-800/50">
          <p className="text-[10px] font-medium uppercase text-muted-foreground">Active</p>
          <p className="text-xl font-bold text-tracksy-blue dark:text-white">
            {queueData.stats.totalActive}
          </p>
        </div>
        <div className="rounded-md border border-tracksy-gold/20 bg-white/50 p-2 dark:border-tracksy-gold/10 dark:bg-gray-800/50">
          <p className="text-[10px] font-medium uppercase text-muted-foreground">Queued</p>
          <p className="text-xl font-bold text-tracksy-blue dark:text-white">
            {queueData.stats.totalQueued}
          </p>
        </div>
        <div className="rounded-md border border-tracksy-gold/20 bg-white/50 p-2 dark:border-tracksy-gold/10 dark:bg-gray-800/50">
          <p className="text-[10px] font-medium uppercase text-muted-foreground">Done</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {queueData.stats.totalCompleted}
          </p>
        </div>
        <div className="rounded-md border border-tracksy-gold/20 bg-white/50 p-2 dark:border-tracksy-gold/10 dark:bg-gray-800/50">
          <p className="text-[10px] font-medium uppercase text-muted-foreground">Failed</p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">
            {queueData.stats.totalFailed}
          </p>
        </div>
      </div>

      {/* Download List */}
      <div className="scrollbar-tracksy mt-4 flex-1 space-y-2 overflow-auto">
        {allDownloads.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-center text-xs text-muted-foreground">No downloads in queue</p>
          </div>
        ) : (
          allDownloads.map((download) => (
            <div
              key={download.id}
              className="group overflow-hidden rounded-lg border border-tracksy-gold/20 bg-white/50 shadow-sm transition-all hover:shadow-md dark:border-tracksy-gold/10 dark:bg-gray-800/50"
            >
              <div className="flex gap-2 p-2.5">
                {/* Thumbnail */}
                {download.thumbnailUrl ? (
                  <div className="relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-md">
                    <img
                      src={download.thumbnailUrl}
                      alt={download.title || "thumbnail"}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    {/* Status badge overlay on thumbnail */}
                    <Badge
                      className={cn(
                        "absolute bottom-1 right-1 h-4 px-1 text-[9px] shadow-lg",
                        statusColors[download.status]
                      )}
                    >
                      {statusLabels[download.status]}
                    </Badge>
                  </div>
                ) : (
                  <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center rounded-md bg-muted">
                    <Badge className={cn("h-4 px-1 text-[9px]", statusColors[download.status])}>
                      {statusLabels[download.status]}
                    </Badge>
                  </div>
                )}

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-2">
                  {/* Header */}
                  <div className="space-y-0.5">
                    <p className="line-clamp-2 text-xs font-semibold leading-tight text-tracksy-blue dark:text-white">
                      {download.title || download.url}
                    </p>
                    {download.channelTitle && (
                      <p className="truncate text-[10px] text-muted-foreground">
                        {download.channelTitle}
                      </p>
                    )}
                  </div>

                  {/* Progress bar */}
                  {download.status === "downloading" && (
                    <div className="space-y-1">
                      <Progress value={download.progress} className="h-1.5" />
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          {download.downloadedSize && download.totalSize && (
                            <span>
                              {download.downloadedSize} / {download.totalSize}
                            </span>
                          )}
                          {download.downloadSpeed && (
                            <span className="font-medium text-tracksy-gold">
                              • {download.downloadSpeed}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {download.eta && (
                            <span className="font-medium text-tracksy-blue dark:text-tracksy-gold">
                              ETA {download.eta}
                            </span>
                          )}
                          <span className="font-semibold">{download.progress}%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error message */}
                  {download.status === "failed" && download.errorMessage && (
                    <p className="line-clamp-2 text-[10px] text-red-600 dark:text-red-400">
                      {download.errorMessage}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center justify-end gap-1.5">
                    {download.status === "completed" && download.filePath && download.videoId && (
                      <Link
                        to="/player"
                        search={{
                          videoId: download.videoId,
                          playlistId: undefined,
                          playlistIndex: undefined,
                        }}
                        className="inline-flex h-6 items-center justify-center rounded-md border bg-background px-2 text-[10px] font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <PlayCircle className="mr-1 h-3 w-3" /> Play
                      </Link>
                    )}
                    {download.status === "downloading" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => pauseMutation.mutate(download.id)}
                        disabled={pauseMutation.isPending}
                        className="h-6 w-6 p-0"
                      >
                        <Pause className="h-3 w-3" />
                      </Button>
                    )}

                    {download.status === "paused" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resumeMutation.mutate(download.id)}
                        disabled={resumeMutation.isPending}
                        className="h-6 w-6 p-0"
                      >
                        <Play className="h-3 w-3" />
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
                          className="h-6 w-6 p-0"
                        >
                          <RotateCw className="h-3 w-3" />
                        </Button>
                      )}

                    {["downloading", "queued", "paused"].includes(download.status) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cancelMutation.mutate(download.id)}
                        disabled={cancelMutation.isPending}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
