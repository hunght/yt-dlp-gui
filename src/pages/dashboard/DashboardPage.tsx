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

export default function DashboardPage() {
  const [url, setUrl] = useState("");
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

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
    </div>
  );
}
