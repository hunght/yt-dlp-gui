import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Play, FileVideo, FileText, Music } from "lucide-react";
import { toast } from "sonner";
import FilenameTemplateSelector from "../../components/FilenameTemplateSelector";
import VideoInfoCard from "./VideoInfoCard";
import type { VideoInfo } from "@/api/types";

interface DownloadFormProps {
  url: string;
  setUrl: (url: string) => void;
  outputType: "video" | "audio";
  setOutputType: (type: "video" | "audio") => void;
  downloadType: string;
  setDownloadType: (type: string) => void;
  outputFormat: "default" | "mp4" | "mp3";
  setOutputFormat: (format: "default" | "mp4" | "mp3") => void;
  outputFilename: string;
  setOutputFilename: (filename: string) => void;
  videoInfo: VideoInfo | null;
  isLoadingVideoInfo: boolean;
  onStartDownload: () => void;
  isStartingDownload: boolean;
}

export default function DownloadForm({
  url,
  setUrl,
  outputType,
  setOutputType,
  downloadType,
  setDownloadType,
  outputFormat,
  setOutputFormat,
  outputFilename,
  setOutputFilename,
  videoInfo,
  isLoadingVideoInfo,
  onStartDownload,
  isStartingDownload,
}: DownloadFormProps) {
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

    onStartDownload();
  };

  return (
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

        {/* Video Info Display */}
        <VideoInfoCard videoInfo={videoInfo} isLoading={isLoadingVideoInfo} />

        <Button
          onClick={handleStartDownload}
          disabled={isStartingDownload || !url.trim()}
          className="w-full"
        >
          {isStartingDownload ? (
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
  );
}
