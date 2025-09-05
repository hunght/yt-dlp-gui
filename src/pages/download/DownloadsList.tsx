import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, Play, Pause, Trash2, ExternalLink, FileVideo, Clock } from "lucide-react";
import { formatBytes } from "../../helpers/format-utils";
import { DownloadWithVideo } from "@/api/types";

interface DownloadsListProps {
  downloads: DownloadWithVideo[] | undefined;
  isLoading: boolean;
  onCancelDownload: (id: string) => void;
  onDeleteDownload: (id: string) => void;
  onOpenFile: (filePath: string) => void;
  isCancelling: boolean;
  isDeleting: boolean;
  isOpening: boolean;
}

export default function DownloadsList({
  downloads,
  isLoading,
  onCancelDownload,
  onDeleteDownload,
  onOpenFile,
  isCancelling,
  isDeleting,
  isOpening,
}: DownloadsListProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "downloading":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "cancelled":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <Download className="h-4 w-4" />;
      case "downloading":
        return <Play className="h-4 w-4" />;
      case "failed":
        return <Trash2 className="h-4 w-4" />;
      case "cancelled":
        return <Pause className="h-4 w-4" />;
      case "pending":
        return <Clock className="h-4 w-4" />;
      default:
        return <FileVideo className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Download History</CardTitle>
          <CardDescription>Manage your downloads and view progress</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-tracksy-blue"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!downloads || downloads.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Download History</CardTitle>
          <CardDescription>Manage your downloads and view progress</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">
            <FileVideo className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>No downloads yet. Start your first download above!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Download History</CardTitle>
        <CardDescription>Manage your downloads and view progress</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {downloads.map((downloadItem) => {
            const download = downloadItem.downloads;
            return (
              <div key={download.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium">
                      {downloadItem.video?.title || "Unknown Title"}
                    </h3>
                    <p className="truncate text-xs text-muted-foreground">{download.url}</p>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <Badge className={getStatusColor(download.status)}>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(download.status)}
                        {download.status}
                      </div>
                    </Badge>
                    {download.status === "downloading" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onCancelDownload(download.id)}
                        disabled={isCancelling}
                      >
                        <Pause className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDeleteDownload(download.id)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {download.status === "downloading" && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{download.progress}%</span>
                    </div>
                    <Progress value={download.progress} className="h-2" />
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-4">
                    {download.format && <span>Format: {download.format}</span>}
                    {download.fileSize && <span>Size: {formatBytes(download.fileSize)}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {download.filePath && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onOpenFile(download.filePath!)}
                        disabled={isOpening}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                    <span>{new Date(download.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {download.errorMessage && (
                  <div className="rounded bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20">
                    Error: {download.errorMessage}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Tips Section */}
        <div className="rounded-md bg-blue-50 p-4 dark:bg-blue-900/20">
          <h4 className="mb-2 text-sm font-medium text-blue-900 dark:text-blue-100">
            💡 How to Use Tags
          </h4>
          <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
            <li>
              • <strong>Output Type:</strong> Choose Video or Audio to set the download target
            </li>
            <li>
              • <strong>Video + Basic:</strong> Default yt-dlp settings (usually best quality)
            </li>
            <li>
              • <strong>Video + Best Merge:</strong> Gets best video + audio and merges them
            </li>
            <li>
              • <strong>Video + 720p Max:</strong> Downloads best quality up to 720p resolution
            </li>
            <li>
              • <strong>Audio + Any Quality:</strong> Downloads only audio (MP3 format)
            </li>
            <li>• Use output filename templates like %(title)s.%(ext)s for custom naming</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
