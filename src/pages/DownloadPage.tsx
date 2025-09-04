import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../utils/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Download,
  Play,
  Pause,
  Trash2,
  ExternalLink,
  FileVideo,
  FileText,
  Clock,
  HardDrive,
  Music,
} from "lucide-react";
import { toast } from "sonner";
import { formatBytes, formatDuration } from "../helpers/format-utils";
import FilenameTemplateSelector from "../components/FilenameTemplateSelector";

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
  const [showFormats, setShowFormats] = useState(false);
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

  // Get available formats for the current URL
  const { data: availableFormats, isLoading: formatsLoading } = useQuery({
    queryKey: ["availableFormats", url],
    queryFn: () => trpcClient.download.getAvailableFormats.query({ url }),
    enabled: !!url && showFormats,
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
    if (!url.trim()) {
      toast.error("Please enter a valid URL");
      return;
    }

    // Validate URL format
    try {
      new URL(url.trim());
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

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
      <Card>
        <CardHeader>
          <CardTitle>Start New Download</CardTitle>
          <CardDescription>
            Enter a YouTube URL to start downloading. Use fallback formats for better compatibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">Video URL</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-4">
            {/* Output Type Tags */}
            <div className="space-y-2">
              <Label>Output Type</Label>
              <div className="flex gap-2">
                <Badge
                  variant={outputType === "video" ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1 text-sm"
                  onClick={() => setOutputType("video")}
                >
                  <FileVideo className="mr-1 h-3 w-3" />
                  Video
                </Badge>
                <Badge
                  variant={outputType === "audio" ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1 text-sm"
                  onClick={() => setOutputType("audio")}
                >
                  <Play className="mr-1 h-3 w-3" />
                  Audio
                </Badge>
              </div>
            </div>

            {/* Download Type Tags - Only show for video */}
            {outputType === "video" && (
              <div className="space-y-2">
                <Label>Download Quality</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={downloadType === "basic" ? "default" : "outline"}
                    className="cursor-pointer px-3 py-1 text-sm"
                    onClick={() => setDownloadType("basic")}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    Basic
                  </Badge>
                  <Badge
                    variant={downloadType === "best-merge" ? "default" : "outline"}
                    className="cursor-pointer px-3 py-1 text-sm"
                    onClick={() => setDownloadType("best-merge")}
                  >
                    <Play className="mr-1 h-3 w-3" />
                    Best Merge
                  </Badge>
                  <Badge
                    variant={downloadType === "limit-720p" ? "default" : "outline"}
                    className="cursor-pointer px-3 py-1 text-sm"
                    onClick={() => setDownloadType("limit-720p")}
                  >
                    <FileVideo className="mr-1 h-3 w-3" />
                    720p Max
                  </Badge>
                </div>
              </div>
            )}

            {/* Audio mode info */}
            {outputType === "audio" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Audio mode: Downloads best available audio quality
                </p>
              </div>
            )}

            {/* Output Format Tags */}
            <div className="space-y-2">
              <Label>Output Format</Label>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={outputFormat === "default" ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1 text-sm"
                  onClick={() => setOutputFormat("default")}
                >
                  <FileText className="mr-1 h-3 w-3" />
                  Default
                </Badge>
                {outputType === "video" && (
                  <Badge
                    variant={outputFormat === "mp4" ? "default" : "outline"}
                    className="cursor-pointer px-3 py-1 text-sm"
                    onClick={() => setOutputFormat("mp4")}
                  >
                    <FileVideo className="mr-1 h-3 w-3" />
                    MP4
                  </Badge>
                )}
                {outputType === "audio" && (
                  <Badge
                    variant={outputFormat === "mp3" ? "default" : "outline"}
                    className="cursor-pointer px-3 py-1 text-sm"
                    onClick={() => setOutputFormat("mp3")}
                  >
                    <Music className="mr-1 h-3 w-3" />
                    MP3
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {outputFormat === "default"
                  ? "Uses yt-dlp's default format selection"
                  : outputFormat === "mp4"
                    ? "Forces MP4 video output"
                    : "Forces MP3 audio output"}
              </p>
            </div>

            <FilenameTemplateSelector
              value={outputFilename}
              onChange={setOutputFilename}
              placeholder="e.g., %(title)s.%(ext)s, MyVideo.%(ext)s"
            />
          </div>

          {/* Available Formats Section */}
          {url && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Available Formats</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFormats(!showFormats)}
                  disabled={!url.trim()}
                >
                  {showFormats ? "Hide" : "Show"} Formats
                </Button>
              </div>

              {showFormats && (
                <div className="rounded-md border bg-muted/50 p-3">
                  {formatsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-tracksy-blue"></div>
                      Loading available formats...
                    </div>
                  ) : availableFormats?.success ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Available formats for this video:</p>
                      <pre className="max-h-40 overflow-auto text-xs text-muted-foreground">
                        {"formats" in availableFormats
                          ? availableFormats.formats
                          : "No formats available"}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {availableFormats && "error" in availableFormats
                        ? availableFormats.error
                        : "Failed to load formats"}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Video Info Display */}
          {isLoadingVideoInfo && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                  <span className="text-sm text-blue-600">Loading video information...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {videoInfo && !isLoadingVideoInfo && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    {videoInfo.thumbnailPath && (
                      <img
                        src={`file://${videoInfo.thumbnailPath}`}
                        alt="Video thumbnail"
                        className="h-16 w-28 rounded object-cover"
                      />
                    )}
                    <div className="flex-1 space-y-1">
                      <h3 className="line-clamp-2 font-medium text-green-800">{videoInfo.title}</h3>
                      {videoInfo.channelTitle && (
                        <p className="text-sm text-green-600">by {videoInfo.channelTitle}</p>
                      )}
                      <div className="flex items-center space-x-4 text-xs text-green-600">
                        {videoInfo.durationFormatted && (
                          <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{videoInfo.durationFormatted}</span>
                          </div>
                        )}
                        {videoInfo.viewCount && (
                          <div className="flex items-center space-x-1">
                            <Play className="h-3 w-3" />
                            <span>{videoInfo.viewCount.toLocaleString()} views</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            onClick={handleStartDownload}
            disabled={startDownloadMutation.isPending || !url.trim()}
            className="w-full"
          >
            {startDownloadMutation.isPending ? (
              <>
                <Play className="mr-2 h-4 w-4 animate-spin" />
                Starting Download...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Start Download
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Downloads List */}
      <Card>
        <CardHeader>
          <CardTitle>Download History</CardTitle>
          <CardDescription>Manage your downloads and view progress</CardDescription>
        </CardHeader>
        <CardContent>
          {downloadsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-tracksy-blue"></div>
            </div>
          ) : downloads?.downloads.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <FileVideo className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>No downloads yet. Start your first download above!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {downloads?.downloads.map((download: any) => (
                <div key={download.id} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium">
                        {download.title || "Unknown Title"}
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
                          onClick={() => cancelDownloadMutation.mutate(download.id)}
                          disabled={cancelDownloadMutation.isPending}
                        >
                          <Pause className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteDownloadMutation.mutate(download.id)}
                        disabled={deleteDownloadMutation.isPending}
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
                          onClick={() => {
                            openFileMutation.mutate(download.filePath!);
                          }}
                          disabled={openFileMutation.isPending}
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
              ))}
            </div>
          )}

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
    </div>
  );
}
