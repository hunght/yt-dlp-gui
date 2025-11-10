import React, { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { logger } from "@/helpers/logger";
import {
  Download,
  Clock,
  Eye,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Video,
  TrendingUp,
} from "lucide-react";

const isValidUrl = (value: string) => {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol);
  } catch {
    return false;
  }
};

const formatDuration = (seconds: number | null): string => {
  if (!seconds) return "Unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [previewInfo, setPreviewInfo] = useState<any>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailError, setThumbnailError] = useState(false);

  // Fetch preview mutation (debounced via effect)
  const previewMutation = useMutation({
    mutationFn: (u: string) => trpcClient.ytdlp.fetchVideoInfo.mutate({ url: u }),
    onSuccess: (res) => {
      setIsLoadingPreview(false);
      if (res.success) {
        logger.debug("Dashboard preview loaded", { info: res.info });
        setPreviewInfo(res.info);
        setThumbnailError(false);
        // Set initial thumbnail URL
        setThumbnailUrl(res.info.thumbnailUrl);
      } else {
        toast.error(res.message ?? "Failed to fetch video info");
        setPreviewInfo(null);
        setThumbnailUrl(null);
      }
    },
    onError: (e: any) => {
      setIsLoadingPreview(false);
      toast.error(e?.message ?? "Failed to fetch video info");
      setPreviewInfo(null);
      setThumbnailUrl(null);
    },
  });

  // Debounce preview fetch on URL change
  useEffect(() => {
    if (!isValidUrl(url)) {
      setPreviewInfo(null);
      setIsLoadingPreview(false);
      setThumbnailUrl(null);
      setThumbnailError(false);
      return;
    }
    setIsLoadingPreview(true);
    const timer = setTimeout(() => {
      logger.debug("Dashboard fetching preview", { url });
      previewMutation.mutate(url);
    }, 600);
    return () => clearTimeout(timer);
  }, [url]);

  const startMutation = useMutation({
    mutationFn: (u: string) => trpcClient.queue.addToQueue.mutate({ urls: [u] }),
    onSuccess: (res) => {
      if (res.success) {
        setDownloadId(res.downloadIds[0] || null);
        // Invalidate queue status to resume polling if it was stopped
        queryClient.invalidateQueries({ queryKey: ["queue", "status"] });
        toast.success(`Download added to queue (${res.downloadIds.length})`);
      } else {
        toast.error(res.message ?? "Failed to start download");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add to queue"),
  });

  const downloadQuery = useQuery({
    queryKey: ["ytdlp", "download", downloadId],
    queryFn: () => trpcClient.ytdlp.getVideoById.query({ id: downloadId! }),
    enabled: !!downloadId && !finished,
    refetchInterval: 1500,
  });

  useEffect(() => {
    const status = downloadQuery.data?.status;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      setFinished(true);
    }
  }, [downloadQuery.data?.status]);

  const canStart = useMemo(
    () => isValidUrl(url) && !startMutation.isPending,
    [url, startMutation.isPending]
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUrl(url)) {
      toast.error("Please enter a valid URL");
      return;
    }
    logger.debug("Dashboard start download", { url });
    setFinished(false);
    startMutation.mutate(url);
  };

  // Load channels
  const channelsQuery = useQuery({
    queryKey: ["ytdlp", "channels"],
    queryFn: () => trpcClient.ytdlp.listChannels.query({ limit: 30 }),
    refetchOnWindowFocus: false,
  });

  return (
    <div className="container mx-auto min-h-screen space-y-6 p-4 pb-8 md:p-6 lg:p-8">
      {/* Header Section */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Download and manage your YouTube videos
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          <span className="hidden sm:inline">Quick access to your content</span>
        </div>
      </div>

      {/* Download Input Section */}
      <Card className="border-2 shadow-lg transition-shadow hover:shadow-xl">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg sm:text-xl">Start a Download</CardTitle>
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Paste any YouTube video or playlist URL
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:gap-2">
            <div className="relative flex-1">
              <Input
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-11 pr-10 sm:h-10"
                inputMode="url"
              />
              {isValidUrl(url) && (
                <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-500" />
              )}
            </div>
            <Button
              type="submit"
              disabled={!canStart}
              className="h-11 gap-2 sm:h-10 sm:min-w-[120px]"
              size="lg"
            >
              {startMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Starting...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Download</span>
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Preview Loading State */}
      {isLoadingPreview && (
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <CardTitle className="text-base sm:text-lg">Loading Preview...</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="h-32 w-full animate-pulse rounded-lg bg-muted sm:h-28 sm:w-48 sm:flex-shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="h-5 w-full animate-pulse rounded bg-muted sm:w-3/4" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted sm:w-1/2" />
                <div className="flex gap-3">
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Info */}
      {!isLoadingPreview && previewInfo && (
        <Card className="overflow-hidden border-l-4 border-l-green-500 shadow-md transition-all hover:shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-green-500" />
              <CardTitle className="text-base sm:text-lg">Video Preview</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-4">
              {/* Thumbnail */}
              {thumbnailUrl && !thumbnailError ? (
                <div className="relative overflow-hidden rounded-lg sm:w-48 sm:flex-shrink-0">
                  <img
                    src={thumbnailUrl}
                    alt="Thumbnail"
                    className="h-auto w-full object-cover sm:h-28"
                    onError={() => {
                      logger.warn("Dashboard thumbnail failed to load, trying fallback", {
                        original: thumbnailUrl,
                      });
                      if (thumbnailUrl.includes(".webp")) {
                        const fallbackUrl = thumbnailUrl
                          .replace(/\.webp$/, ".jpg")
                          .replace(/vi_webp/, "vi");
                        setThumbnailUrl(fallbackUrl);
                        logger.debug("Dashboard thumbnail fallback", { fallback: fallbackUrl });
                      } else {
                        setThumbnailError(true);
                        logger.error("Dashboard thumbnail all fallbacks failed", {
                          url: thumbnailUrl,
                        });
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="flex h-32 w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground sm:h-28 sm:w-48 sm:flex-shrink-0">
                  <Video className="h-8 w-8 opacity-50" />
                </div>
              )}

              {/* Video Info */}
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className="line-clamp-2 text-base font-semibold leading-tight sm:text-lg">
                  {previewInfo.title}
                </h3>
                {previewInfo.channelTitle && (
                  <p className="truncate text-sm text-muted-foreground">
                    {previewInfo.channelTitle}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:text-sm">
                  {previewInfo.durationSeconds && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatDuration(previewInfo.durationSeconds)}</span>
                    </div>
                  )}
                  {previewInfo.viewCount !== null && (
                    <div className="flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" />
                      <span>{previewInfo.viewCount.toLocaleString()} views</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Download Status */}
      {downloadId && (
        <Card
          className={`border-l-4 shadow-md ${
            downloadQuery.data?.status === "completed"
              ? "border-l-green-500"
              : downloadQuery.data?.status === "failed"
                ? "border-l-red-500"
                : "border-l-blue-500"
          }`}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {downloadQuery.data?.status === "completed" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : downloadQuery.data?.status === "failed" ? (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                )}
                <CardTitle className="text-base sm:text-lg">Download Status</CardTitle>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  downloadQuery.data?.status === "completed"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : downloadQuery.data?.status === "failed"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                }`}
              >
                {downloadQuery.data?.status ?? "Initializing"}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {!downloadQuery.data ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Initializing download...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-semibold tabular-nums">
                      {downloadQuery.data.progress ?? 0}%
                    </span>
                  </div>
                  <Progress
                    value={downloadQuery.data.progress ?? 0}
                    className="h-3"
                    indicatorClassName={
                      downloadQuery.data.status === "completed"
                        ? "bg-green-500"
                        : downloadQuery.data.status === "failed"
                          ? "bg-red-500"
                          : "bg-blue-500"
                    }
                  />
                </div>

                {/* Download Stats */}
                {downloadQuery.data.status === "downloading" && (
                  <div className="grid gap-2 rounded-lg bg-muted/50 p-3 sm:grid-cols-2">
                    {(downloadQuery.data as any).downloadedSize &&
                      (downloadQuery.data as any).totalSize && (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">Size</span>
                          <span className="text-sm font-medium tabular-nums">
                            {(downloadQuery.data as any).downloadedSize} /{" "}
                            {(downloadQuery.data as any).totalSize}
                          </span>
                        </div>
                      )}
                    {(downloadQuery.data as any).downloadSpeed && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">Speed</span>
                        <span className="text-sm font-medium tabular-nums text-blue-600 dark:text-blue-400">
                          {(downloadQuery.data as any).downloadSpeed}
                        </span>
                      </div>
                    )}
                    {(downloadQuery.data as any).eta && (
                      <div className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-xs text-muted-foreground">Time remaining</span>
                        <span className="text-sm font-medium tabular-nums">
                          {(downloadQuery.data as any).eta}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Details */}
                <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                    <span className="text-xs font-medium text-muted-foreground">ID:</span>
                    <code className="break-all text-xs">{downloadId}</code>
                  </div>
                  {downloadQuery.data.filePath && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">File path:</span>
                      <code className="break-all text-xs">{downloadQuery.data.filePath}</code>
                    </div>
                  )}
                  {downloadQuery.data.errorMessage && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-red-600 dark:text-red-400">
                        Error:
                      </span>
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {downloadQuery.data.errorMessage}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Channels Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg sm:text-xl">Channels</CardTitle>
            </div>
            {channelsQuery.data && channelsQuery.data.length > 0 && (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {channelsQuery.data.length}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {channelsQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-14 w-14 animate-pulse rounded-full bg-muted sm:h-16 sm:w-16" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : channelsQuery.data && channelsQuery.data.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {channelsQuery.data.map((channel) => (
                <Link
                  key={channel.channelId}
                  to="/channel"
                  search={{ channelId: channel.channelId }}
                  className="group flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md"
                >
                  {/* Channel Avatar and Title */}
                  <div className="flex items-center gap-3">
                    {channel.thumbnailUrl ? (
                      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full ring-2 ring-primary/10 transition-all group-hover:ring-primary/30 sm:h-16 sm:w-16">
                        <img
                          src={channel.thumbnailUrl}
                          alt={channel.channelTitle}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary sm:h-16 sm:w-16 sm:text-base">
                        {channel.channelTitle.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h4 className="line-clamp-2 font-semibold leading-tight group-hover:text-primary">
                        {channel.channelTitle}
                      </h4>
                    </div>
                  </div>

                  {/* Channel Stats */}
                  <div className="space-y-2 border-t pt-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Video className="h-3.5 w-3.5" />
                        <span>
                          {channel.videoCount} {channel.videoCount === 1 ? "video" : "videos"}
                        </span>
                      </div>
                      {channel.lastUpdated && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(channel.lastUpdated).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                    {channel.subscriberCount && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        <span>{channel.subscriberCount.toLocaleString()} subscribers</span>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="rounded-full bg-muted p-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">No channels yet</p>
                <p className="text-sm text-muted-foreground">
                  Channels will appear here after you download videos
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
