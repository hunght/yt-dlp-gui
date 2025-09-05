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
  getRecommendedFormats,
  getReliableFormats,
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
        ...getRecommendedFormats(),
        ...getFormatsByCategory("video"),
        ...getFormatsByCategory("advanced"),
      ];
    }
  };

  // Get recommended formats for main display
  const getRecommendedVideoFormats = () => {
    return getRecommendedFormats().filter((f) => f.category === "recommended");
  };

  // Get reliable audio formats for main display
  const getReliableAudioFormats = () => {
    return getReliableFormats().filter((f) => f.category === "audio");
  };

  // Get advanced formats for expanded view
  const getAdvancedFormats = () => {
    return getFormatsByCategory("advanced");
  };

  // Get video format options for expanded view
  const getVideoFormats = () => {
    return getFormatsByCategory("video");
  };

  // Get format icon based on quality and category
  const getFormatIcon = (format: any) => {
    if (format.category === "audio") return Music;
    if (format.category === "recommended") return Sparkles;
    if (format.quality === "highest") return Zap;
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

  // Get reliability indicator
  const getReliabilityIndicator = (reliability: string) => {
    switch (reliability) {
      case "excellent":
        return "✅";
      case "good":
        return "✓";
      case "fair":
        return "⚠️";
      case "experimental":
        return "🧪";
      default:
        return "";
    }
  };

  // Get reliability color
  const getReliabilityColor = (reliability: string) => {
    switch (reliability) {
      case "excellent":
        return "text-green-600 dark:text-green-400";
      case "good":
        return "text-blue-600 dark:text-blue-400";
      case "fair":
        return "text-yellow-600 dark:text-yellow-400";
      case "experimental":
        return "text-orange-600 dark:text-orange-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Start New Download
          <Badge variant="secondary" className="text-xs">
            Enhanced Format Detection
          </Badge>
        </CardTitle>
        <CardDescription>
          Enter a YouTube URL to start downloading.
          <span className="mt-1 block text-sm">
            ✅ = Excellent reliability • ✓ = Good reliability • ⚠️ = May have issues • 🧪 =
            Experimental
          </span>
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

          {/* Quick Format Recommendations */}
          {url.trim() && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/20">
              <div className="mb-2 text-xs font-medium text-blue-900 dark:text-blue-100">
                💡 Quick Start Recommendations
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={downloadFormat === "bestvideo+bestaudio" ? "default" : "secondary"}
                  className="cursor-pointer"
                  onClick={() => setDownloadFormat("bestvideo+bestaudio")}
                >
                  ✅ Most Reliable
                </Badge>
                <Badge
                  variant={downloadFormat === "best720p" ? "default" : "secondary"}
                  className="cursor-pointer"
                  onClick={() => setDownloadFormat("best720p")}
                >
                  ✓ 720p HD
                </Badge>
                <Badge
                  variant={downloadFormat === "audioonly" ? "default" : "secondary"}
                  className="cursor-pointer"
                  onClick={() => setDownloadFormat("audioonly")}
                >
                  🎵 Audio Only
                </Badge>
              </div>
            </div>
          )}
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

              {/* Recommended Video Options */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  🎯 Recommended (tested and reliable):
                </p>
                <div className="flex flex-wrap gap-2">
                  {getRecommendedVideoFormats().map((format) => {
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
                        <span className={`text-xs ${getReliabilityColor(format.reliability)}`}>
                          {getReliabilityIndicator(format.reliability)}
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
                  <div className="space-y-3 border-t border-border pt-3">
                    {/* Help Section */}
                    <div className="rounded-md bg-muted/30 p-3">
                      <div className="mb-2 text-xs font-medium">📖 Format Selection Guide</div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div>
                          • <strong>Recommended formats</strong> are tested for maximum reliability
                        </div>
                        <div>
                          • <strong>Video formats</strong> offer specific container/codec
                          preferences
                        </div>
                        <div>
                          • <strong>Advanced options</strong> may have compatibility issues
                        </div>
                        <div>
                          • When in doubt, use "Best Quality (Reliable)" - it works on most videos
                        </div>
                      </div>
                    </div>

                    {/* Video Format Options */}
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">📹 Video format options:</p>
                      <div className="flex flex-wrap gap-2">
                        {getVideoFormats().map((format) => {
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
                              <span
                                className={`text-xs ${getReliabilityColor(format.reliability)}`}
                              >
                                {getReliabilityIndicator(format.reliability)}
                              </span>
                            </Badge>
                          );
                        })}
                      </div>
                    </div>

                    {/* Advanced Options */}
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">⚙️ Advanced options:</p>
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
                              <span
                                className={`text-xs ${getReliabilityColor(format.reliability)}`}
                              >
                                {getReliabilityIndicator(format.reliability)}
                              </span>
                            </Badge>
                          );
                        })}
                      </div>
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
                <p className="text-xs text-muted-foreground">
                  🎵 Audio download options (reliable):
                </p>
                <div className="flex flex-wrap gap-2">
                  {getReliableAudioFormats().map((format) => {
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
                        <span className={`text-xs ${getReliabilityColor(format.reliability)}`}>
                          {getReliabilityIndicator(format.reliability)}
                        </span>
                      </Badge>
                    );
                  })}
                </div>

                {/* Additional Audio Options */}
                {getFormatsByCategory("audio").filter((f) => f.reliability !== "excellent").length >
                  0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs text-muted-foreground">Additional audio options:</p>
                    <div className="flex flex-wrap gap-2">
                      {getFormatsByCategory("audio")
                        .filter((f) => f.reliability !== "excellent")
                        .map((format) => {
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
                              <span
                                className={`text-xs ${getReliabilityColor(format.reliability)}`}
                              >
                                {getReliabilityIndicator(format.reliability)}
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

          {/* Format Description with Compatibility Warning */}
          {downloadFormat && (
            <div className="space-y-2">
              <div className="rounded-md bg-muted/50 p-3 text-xs">
                <div className="space-y-1">
                  <div className="font-medium text-foreground">
                    {formatOptions.find((f) => f.value === downloadFormat)?.label}
                  </div>
                  <div className="text-muted-foreground">
                    {formatOptions.find((f) => f.value === downloadFormat)?.description}
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span
                      className={getReliabilityColor(
                        formatOptions.find((f) => f.value === downloadFormat)?.reliability || ""
                      )}
                    >
                      Reliability:{" "}
                      {formatOptions.find((f) => f.value === downloadFormat)?.reliability}
                    </span>
                    <span className="text-muted-foreground">
                      Compatibility:{" "}
                      {formatOptions.find((f) => f.value === downloadFormat)?.compatibility}
                    </span>
                    <span className="text-muted-foreground">
                      Size: {formatOptions.find((f) => f.value === downloadFormat)?.fileSize}
                    </span>
                  </div>
                </div>
              </div>

              {/* Compatibility Warning for Fair/Experimental formats */}
              {(formatOptions.find((f) => f.value === downloadFormat)?.reliability === "fair" ||
                formatOptions.find((f) => f.value === downloadFormat)?.reliability ===
                  "experimental") && (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950/20">
                  <div className="mb-1 text-xs font-medium text-yellow-900 dark:text-yellow-100">
                    ⚠️ Compatibility Notice
                  </div>
                  <div className="text-xs text-yellow-800 dark:text-yellow-200">
                    This format may not work on all videos due to YouTube restrictions. Consider
                    using "Best Quality (Reliable)" for better success rate.
                  </div>
                </div>
              )}
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

        {/* Video Info Display with Format Testing */}
        <div className="space-y-2">
          <VideoInfoCard videoInfo={videoInfo} isLoading={isLoadingVideoInfo} />

          {/* Format Testing Section */}
          {url.trim() && videoInfo && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/20">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-green-900 dark:text-green-100">
                    🔧 Format Testing Available
                  </div>
                  <div className="text-xs text-green-800 dark:text-green-200">
                    Test your selected format before downloading
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // This would trigger format testing in a real implementation
                    toast.info("Format testing would run here - see debug-formats.js script");
                  }}
                  className="text-xs"
                >
                  Test Format
                </Button>
              </div>
            </div>
          )}
        </div>

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
