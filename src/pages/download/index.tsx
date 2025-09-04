import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../../utils/trpc";
import { Download, Play, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { formatBytes } from "../../helpers/format-utils";
import DownloadForm from "./DownloadForm";
import DownloadsList from "./DownloadsList";

// Helper function to validate URL
function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

export default function DownloadPage() {
  const [url, setUrl] = useState("");
  const [outputType, setOutputType] = useState<"video" | "audio">("video");
  const [downloadType, setDownloadType] = useState("basic");
  const [outputFormat, setOutputFormat] = useState<"default" | "mp4" | "mp3">(() => {
    // Auto-select based on output type
    return outputType === "audio" ? "mp3" : "mp4";
  });
  const [outputFilename, setOutputFilename] = useState("%(title)s.%(ext)s");
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const [isLoadingVideoInfo, setIsLoadingVideoInfo] = useState(false);
  const queryClient = useQueryClient();

  // Auto-update output format when output type changes
  useEffect(() => {
    if (outputType === "audio") {
      setOutputFormat("mp3");
    } else {
      setOutputFormat("mp4");
    }
  }, [outputType]);

  // Debounced video info fetching
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (url.trim() && isValidUrl(url.trim())) {
        setIsLoadingVideoInfo(true);
        try {
          const result = await trpcClient.download.getVideoInfo.mutate({
            url: url.trim(),
          });
          if (result.success && "videoInfo" in result) {
            setVideoInfo(result.videoInfo);
          } else {
            setVideoInfo(null);
          }
        } catch (error) {
          console.error("Failed to get video info:", error);
          setVideoInfo(null);
        } finally {
          setIsLoadingVideoInfo(false);
        }
      } else {
        setVideoInfo(null);
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [url]);

  // Queries
  const { data: downloads, isLoading: downloadsLoading } = useQuery({
    queryKey: ["downloads"],
    queryFn: () => trpcClient.download.getDownloads.query({ page: 1, limit: 50 }),
  });

  const { data: stats } = useQuery({
    queryKey: ["downloadStats"],
    queryFn: () => trpcClient.download.getDownloadStats.query(),
  });

  // Mutations
  const startDownloadMutation = useMutation({
    mutationFn: (data: {
      url: string;
      format: string;
      quality?: string;
      outputFilename?: string;
      outputFormat?: "default" | "mp4" | "mp3";
      videoInfo?: any;
    }) => trpcClient.download.startDownload.mutate(data),
    onSuccess: () => {
      toast.success("Download started successfully!");
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
      queryClient.invalidateQueries({ queryKey: ["downloadStats"] });
      setUrl("");
    },
    onError: (error) => {
      toast.error(`Failed to start download: ${error.message}`);
    },
  });

  const cancelDownloadMutation = useMutation({
    mutationFn: (id: string) => trpcClient.download.cancelDownload.mutate({ id }),
    onSuccess: () => {
      toast.success("Download cancelled");
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
      queryClient.invalidateQueries({ queryKey: ["downloadStats"] });
    },
    onError: (error) => {
      toast.error(`Failed to cancel download: ${error.message}`);
    },
  });

  const deleteDownloadMutation = useMutation({
    mutationFn: (id: string) => trpcClient.download.deleteDownload.mutate({ id }),
    onSuccess: () => {
      toast.success("Download deleted");
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
      queryClient.invalidateQueries({ queryKey: ["downloadStats"] });
    },
    onError: (error) => {
      toast.error(`Failed to delete download: ${error.message}`);
    },
  });

  const openFileMutation = useMutation({
    mutationFn: (filePath: string) => trpcClient.utils.openLocalFile.mutate({ filePath }),
    onSuccess: () => {
      toast.success("File opened");
    },
    onError: (error) => {
      toast.error(`Failed to open file: ${error.message}`);
    },
  });

  const getFormatForDownloadType = () => {
    // If output type is audio, override download type
    if (outputType === "audio") {
      return "bestaudio";
    }

    switch (downloadType) {
      case "basic":
        return ""; // yt-dlp default
      case "best-merge":
        return "bestvideo+bestaudio";
      case "limit-720p":
        return "bestvideo[height<=720]+bestaudio/best[height<=720]";
      default:
        return "";
    }
  };

  const handleStartDownload = () => {
    const format = getFormatForDownloadType();

    startDownloadMutation.mutate({
      url: url.trim(),
      format,
      quality: undefined,
      outputFilename: outputFilename,
      outputFormat: outputFormat,
      videoInfo: videoInfo || undefined,
    } as any);
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-tracksy-blue dark:text-white">Download Manager</h1>
          <p className="text-muted-foreground">Download YouTube videos with yt-dlp</p>
        </div>
        {stats && (
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-green-600" />
              <span>{stats.completedDownloads} completed</span>
            </div>
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-blue-600" />
              <span>{stats.downloadingDownloads} downloading</span>
            </div>
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-purple-600" />
              <span>{formatBytes(stats.totalFileSize)} total</span>
            </div>
          </div>
        )}
      </div>

      {/* Download Form */}
      <DownloadForm
        url={url}
        setUrl={setUrl}
        outputType={outputType}
        setOutputType={setOutputType}
        downloadType={downloadType}
        setDownloadType={setDownloadType}
        outputFormat={outputFormat}
        setOutputFormat={setOutputFormat}
        outputFilename={outputFilename}
        setOutputFilename={setOutputFilename}
        videoInfo={videoInfo}
        isLoadingVideoInfo={isLoadingVideoInfo}
        onStartDownload={handleStartDownload}
        isStartingDownload={startDownloadMutation.isPending}
      />

      {/* Downloads List */}
      <DownloadsList
        downloads={downloads?.downloads}
        isLoading={downloadsLoading}
        onCancelDownload={cancelDownloadMutation.mutate}
        onDeleteDownload={deleteDownloadMutation.mutate}
        onOpenFile={openFileMutation.mutate}
        isCancelling={cancelDownloadMutation.isPending}
        isDeleting={deleteDownloadMutation.isPending}
        isOpening={openFileMutation.isPending}
      />
    </div>
  );
}
