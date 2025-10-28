import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { logger } from "@/helpers/logger";

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
    mutationFn: (u: string) => trpcClient.ytdlp.startVideoDownload.mutate({ url: u }),
    onSuccess: (res) => {
      if (res.success) {
        setDownloadId(res.id);
        toast.success("Download started");
      } else {
        toast.error(res.message ?? "Failed to start download");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to start download"),
  });

  const downloadQuery = useQuery({
    queryKey: ["ytdlp", "download", downloadId],
    queryFn: () => trpcClient.ytdlp.getDownload.query({ id: downloadId! }),
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
              <div className="space-y-1 text-sm">
                <div><span className="text-muted-foreground">ID:</span> {downloadId}</div>
                <div><span className="text-muted-foreground">Status:</span> {downloadQuery.data.status}</div>
                <div><span className="text-muted-foreground">Progress:</span> {downloadQuery.data.progress ?? 0}%</div>
                {downloadQuery.data.filePath && (
                  <div className="truncate"><span className="text-muted-foreground">File:</span> {downloadQuery.data.filePath}</div>
                )}
                {downloadQuery.data.errorMessage && (
                  <div className="text-red-600"><span className="text-muted-foreground">Error:</span> {downloadQuery.data.errorMessage}</div>
                )}
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
              {completedQuery.data.map((d) => (
                <div key={d.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{d.title ?? d.videoId ?? d.url}</div>
                    <div className="truncate text-xs text-muted-foreground">{d.filePath}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.completedAt ? new Date(d.completedAt).toLocaleString() : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground">No downloads yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
