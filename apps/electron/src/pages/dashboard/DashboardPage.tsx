import React, { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { logger } from "@/helpers/logger";
import { DownloadQueueCard } from "@/components/DownloadQueueCard";
import Thumbnail from "@/components/Thumbnail";

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

  const canStart = useMemo(() => isValidUrl(url) && !startMutation.isPending, [url, startMutation.isPending]);

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

  // Load completed downloads
  const completedQuery = useQuery({
    queryKey: ["ytdlp", "downloads", "completed"],
    queryFn: () => trpcClient.ytdlp.listCompletedDownloads.query({ limit: 50 }),
    refetchOnWindowFocus: false,
  });

  // Load channels
  const channelsQuery = useQuery({
    queryKey: ["ytdlp", "channels"],
    queryFn: () => trpcClient.ytdlp.listChannels.query({ limit: 30 }),
    refetchOnWindowFocus: false,
  });

  return (
    <div className="container mx-auto space-y-6 p-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start a YouTube download</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Paste a YouTube URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
              inputMode="url"
            />
            <Button type="submit" disabled={!canStart}>
              {startMutation.isPending ? "Starting..." : "Download"}
            </Button>
          </form>
        </CardContent>
      </Card>

        {/* Download Queue */}
        <DownloadQueueCard />

      {isLoadingPreview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="h-24 w-40 animate-pulse rounded bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoadingPreview && previewInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {thumbnailUrl && !thumbnailError ? (
                <img
                  src={thumbnailUrl}
                  alt="Thumbnail"
                  className="h-24 w-40 rounded object-cover"
                  onError={(e) => {
                    logger.warn("Dashboard thumbnail failed to load, trying fallback", {
                      original: thumbnailUrl,
                    });
                    // Try fallback from .webp to .jpg
                    if (thumbnailUrl.includes(".webp")) {
                      const fallbackUrl = thumbnailUrl.replace(/\.webp$/, ".jpg").replace(/vi_webp/, "vi");
                      setThumbnailUrl(fallbackUrl);
                      logger.debug("Dashboard thumbnail fallback", { fallback: fallbackUrl });
                    } else {
                      // No more fallbacks, hide thumbnail
                      setThumbnailError(true);
                      logger.error("Dashboard thumbnail all fallbacks failed", {
                        url: thumbnailUrl,
                      });
                    }
                  }}
                />
              ) : (
                <div className="flex h-24 w-40 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                  No thumbnail
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="truncate font-semibold">{previewInfo.title}</div>
                {previewInfo.channelTitle && (
                  <div className="text-sm text-muted-foreground">{previewInfo.channelTitle}</div>
                )}
                <div className="flex gap-3 text-xs text-muted-foreground">
                  {previewInfo.durationSeconds && (
                    <span>Duration: {formatDuration(previewInfo.durationSeconds)}</span>
                  )}
                  {previewInfo.viewCount !== null && (
                    <span>Views: {previewInfo.viewCount.toLocaleString()}</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {downloadId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Download status</CardTitle>
          </CardHeader>
          <CardContent>
            {!downloadQuery.data ? (
              <div className="text-muted-foreground">Initializing...</div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status: {downloadQuery.data.status}</span>
                    <span className="font-medium">{downloadQuery.data.progress ?? 0}%</span>
                  </div>
                  <Progress
                    value={downloadQuery.data.progress ?? 0}
                    className="h-2"
                    indicatorClassName={
                      downloadQuery.data.status === "completed"
                        ? "bg-green-500"
                        : downloadQuery.data.status === "failed"
                        ? "bg-red-500"
                        : "bg-blue-500"
                    }
                  />
                </div>
                <div className="space-y-1 text-sm">
                  <div className="text-xs text-muted-foreground">ID: {downloadId}</div>
                  {downloadQuery.data.filePath && (
                    <div className="truncate">
                      <span className="text-muted-foreground">File:</span> {downloadQuery.data.filePath}
                    </div>
                  )}
                  {downloadQuery.data.errorMessage && (
                    <div className="text-red-600">
                      <span className="text-muted-foreground">Error:</span> {downloadQuery.data.errorMessage}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Completed downloads</CardTitle>
        </CardHeader>
        <CardContent>
          {completedQuery.isLoading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : completedQuery.data && completedQuery.data.length > 0 ? (
            <div className="divide-y">
              {completedQuery.data.map((d) => {
                return (
                  <div key={d.videoId} className="flex items-center gap-3 py-2">
                    {/* Thumbnail */}
                    <Thumbnail
                      thumbnailPath={d.thumbnailPath}
                      thumbnailUrl={d.thumbnailUrl}
                      alt={d.title || d.videoId || "thumbnail"}
                      className="h-12 w-20 flex-shrink-0 rounded object-cover"
                    />

                    {/* Meta */}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{d.title ?? d.videoId}</div>
                      <div className="truncate text-xs text-muted-foreground">{d.filePath}</div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {d.videoId && (
                        <Link
                          to="/player"
                          search={{ videoId: d.videoId }}
                          className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
                        >
                          Play
                        </Link>
                      )}
                      <div className="text-xs text-muted-foreground min-w-[8rem] text-right">
                        {d.completedAt ? new Date(d.completedAt).toLocaleString() : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-muted-foreground">No downloads yet.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channels</CardTitle>
        </CardHeader>
        <CardContent>
          {channelsQuery.isLoading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : channelsQuery.data && channelsQuery.data.length > 0 ? (
            <div className="divide-y">
              {channelsQuery.data.map((channel) => (
                <Link
                  key={channel.channelId}
                  to="/channel"
                  search={{ channelId: channel.channelId }}
                  className="flex items-center gap-3 py-3 hover:bg-accent rounded-md px-2 -mx-2 transition-colors"
                >
                  {channel.thumbnailUrl ? (
                    <img
                      src={channel.thumbnailUrl}
                      alt={channel.channelTitle}
                      className="h-12 w-12 rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {channel.channelTitle.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{channel.channelTitle}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{channel.videoCount} {channel.videoCount === 1 ? "video" : "videos"}</span>
                      {channel.subscriberCount && (
                        <>
                          <span>•</span>
                          <span>{channel.subscriberCount.toLocaleString()} subscribers</span>
                        </>
                      )}
                    </div>
                  </div>
                  {channel.lastUpdated && (
                    <div className="text-xs text-muted-foreground">
                      {new Date(channel.lastUpdated).toLocaleDateString()}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground">No channels yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
