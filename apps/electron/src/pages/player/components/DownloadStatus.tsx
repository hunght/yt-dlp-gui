import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { trpcClient } from "@/utils/trpc";

interface DownloadStatusProps {
  videoId: string;
  status?: string | null;
  progress?: number | null;
  onStartDownload: () => void;
  isStarting: boolean;
}

export function DownloadStatus({
  videoId,
  status,
  progress,
  onStartDownload,
  isStarting,
}: DownloadStatusProps) {
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

  return (
    <div className="space-y-3">
      <Alert>
        <AlertTitle>File not available</AlertTitle>
        <AlertDescription>
          The video has no downloaded file yet. {status ? "Current status shown below." : "Start a download to fetch it."}
        </AlertDescription>
      </Alert>

      {/* Show progress if any */}
      {status && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status: {status}</span>
            <span className="font-medium">{progress ?? 0}%</span>
          </div>
          <Progress
            value={progress ?? 0}
            className="h-2"
            indicatorClassName={
              status === "completed"
                ? "bg-green-500"
                : status === "failed"
                ? "bg-red-500"
                : "bg-blue-500"
            }
          />
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={onStartDownload}
          disabled={isStarting || ["downloading", "queued"].includes(status || "")}
        >
          {isStarting
            ? "Starting..."
            : ["downloading", "queued"].includes(status || "")
            ? statusText(status, progress)
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
  );
}
