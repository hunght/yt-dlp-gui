import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Play,
  FileVideo,
  FileText,
  Music,
  ChevronDown,
  ChevronUp,
  Zap,
  HardDrive,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import FilenameTemplateSelector from "../../components/FilenameTemplateSelector";
import VideoInfoCard from "./VideoInfoCard";
import { YoutubeVideo } from "@/api/db/schema";
import {
  DownloadFormat,
  OutputFormat,
  formatOptions,
  outputFormatOptions,
  getPopularFormats,
  getFormatsByCategory,
} from "@/api/types";

interface DownloadFormProps {
  url: string;
  setUrl: (url: string) => void;
  outputType: "video" | "audio";
  setOutputType: (type: "video" | "audio") => void;
  downloadFormat: DownloadFormat;
  setDownloadFormat: (format: DownloadFormat) => void;
  outputFormat: OutputFormat;
  setOutputFormat: (format: OutputFormat) => void;
  outputFilename: string;
  setOutputFilename: (filename: string) => void;
  videoInfo: YoutubeVideo | null;
  isLoadingVideoInfo: boolean;
  onStartDownload: () => void;
  isStartingDownload: boolean;
}

export default function DownloadForm({
  url,
  setUrl,
  outputType,
  setOutputType,
  downloadFormat,
  setDownloadFormat,
  outputFormat,
  setOutputFormat,
  outputFilename,
  setOutputFilename,
  videoInfo,
  isLoadingVideoInfo,
  onStartDownload,
  isStartingDownload,
}: DownloadFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  // Get available formats based on output type
  const getAvailableFormats = () => {
    if (outputType === "audio") {
      return getFormatsByCategory("audio");
    } else {
      return [
        ...getPopularFormats().filter((f) => f.category === "video"),
        ...getFormatsByCategory("advanced"),
      ];
    }
  };

  // Get popular formats for main display
  const getPopularVideoFormats = () => {
    return getPopularFormats().filter((f) => f.category === "video");
  };

  // Get popular audio formats for main display
  const getPopularAudioFormats = () => {
    return getPopularFormats().filter((f) => f.category === "audio");
  };

  // Get advanced formats for expanded view
  const getAdvancedFormats = () => {
    return getFormatsByCategory("advanced");
  };

  // Get format icon based on quality and category
  const getFormatIcon = (format: any) => {
    if (format.category === "audio") return Music;
    if (format.quality === "highest") return Sparkles;
    if (format.fileSize === "small") return HardDrive;
    return FileVideo;
  };

  // Get quality color
  const getQualityColor = (quality: string) => {
    switch (quality) {
      case "highest":
        return "text-purple-600 dark:text-purple-400";
      case "high":
        return "text-blue-600 dark:text-blue-400";
      case "medium":
        return "text-green-600 dark:text-green-400";
      case "low":
        return "text-yellow-600 dark:text-yellow-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
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
                <Music className="mr-1 h-3 w-3" />
                Audio
              </Badge>
            </div>
          </div>

          {/* Quality Selection - Video */}
          {outputType === "video" && (
            <div className="space-y-3">
              <Label>Video Quality</Label>

              {/* Popular Video Options */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Popular choices:</p>
                <div className="flex flex-wrap gap-2">
                  {getPopularVideoFormats().map((format) => {
                    const Icon = getFormatIcon(format);
                    return (
                      <Badge
                        key={format.value}
                        variant={downloadFormat === format.value ? "default" : "outline"}
                        className="flex cursor-pointer items-center gap-1 px-3 py-2 text-sm"
                        onClick={() => setDownloadFormat(format.value)}
                      >
                        <Icon className="h-3 w-3" />
                        <span>{format.label}</span>
                        <span className={`text-xs ${getQualityColor(format.quality)}`}>
                          {format.quality === "highest"
                            ? "★"
                            : format.quality === "high"
                              ? "●"
                              : "○"}
                        </span>
                      </Badge>
                    );
                  })}
                </div>
              </div>

              {/* Advanced Options Toggle */}
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="h-auto p-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {showAdvanced ? (
                    <>
                      <ChevronUp className="mr-1 h-3 w-3" />
                      Hide Advanced Options
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-1 h-3 w-3" />
                      Show Advanced Options
                    </>
                  )}
                </Button>

                {/* Advanced Video Options */}
                {showAdvanced && (
                  <div className="space-y-2 border-t border-border pt-2">
                    <p className="text-xs text-muted-foreground">Advanced options:</p>
                    <div className="flex flex-wrap gap-2">
                      {getAdvancedFormats().map((format) => {
                        const Icon = getFormatIcon(format);
                        return (
                          <Badge
                            key={format.value}
                            variant={downloadFormat === format.value ? "default" : "outline"}
                            className="flex cursor-pointer items-center gap-1 px-3 py-2 text-sm"
                            onClick={() => setDownloadFormat(format.value)}
                          >
                            <Icon className="h-3 w-3" />
                            <span>{format.label}</span>
                            <span className={`text-xs ${getQualityColor(format.quality)}`}>
                              {format.quality === "highest"
                                ? "★"
                                : format.quality === "high"
                                  ? "●"
                                  : "○"}
                            </span>
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quality Selection - Audio */}
          {outputType === "audio" && (
            <div className="space-y-3">
              <Label>Audio Quality</Label>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Audio download options:</p>
                <div className="flex flex-wrap gap-2">
                  {getPopularAudioFormats().map((format) => {
                    const Icon = getFormatIcon(format);
                    return (
                      <Badge
                        key={format.value}
                        variant={downloadFormat === format.value ? "default" : "outline"}
                        className="flex cursor-pointer items-center gap-1 px-3 py-2 text-sm"
                        onClick={() => setDownloadFormat(format.value)}
                      >
                        <Icon className="h-3 w-3" />
                        <span>{format.label}</span>
                        <span className={`text-xs ${getQualityColor(format.quality)}`}>
                          {format.quality === "highest"
                            ? "★"
                            : format.quality === "high"
                              ? "●"
                              : "○"}
                        </span>
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Format Description */}
          {downloadFormat && (
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              {formatOptions.find((f) => f.value === downloadFormat)?.description}
            </div>
          )}

          {/* Output Format Tags */}
          <div className="space-y-2">
            <Label>Output Format</Label>
            <div className="flex flex-wrap gap-2">
              {outputFormatOptions
                .filter((f) =>
                  outputType === "audio" ? f.category === "audio" : f.category === "video"
                )
                .map((format) => (
                  <Badge
                    key={format.value}
                    variant={outputFormat === format.value ? "default" : "outline"}
                    className="cursor-pointer px-3 py-1 text-sm"
                    onClick={() => setOutputFormat(format.value)}
                  >
                    <FileText className="mr-1 h-3 w-3" />
                    {format.label}
                  </Badge>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {outputFormatOptions.find((f) => f.value === outputFormat)?.description}
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
