import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Play } from "lucide-react";
import { trpcClient } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";

interface VideoInfo {
  title: string;
  channelTitle?: string;
  durationFormatted?: string;
  viewCount?: number;
  thumbnailPath?: string;
}

interface VideoInfoCardProps {
  videoInfo: VideoInfo | undefined;
  isLoading: boolean;
}

export default function VideoInfoCard({ videoInfo, isLoading }: VideoInfoCardProps) {
  // Use useQuery to convert image to data URL with caching and loading states
  const {
    data: thumbnailDataUrl,
    isLoading: isThumbnailLoading,
    error: thumbnailError,
  } = useQuery({
    queryKey: ["thumbnail", videoInfo?.thumbnailPath],
    queryFn: async () => {
      if (!videoInfo?.thumbnailPath) return null;

      return await trpcClient.download.convertImageToDataUrl.query({
        imagePath: videoInfo.thumbnailPath,
      });
    },
    enabled: !!videoInfo?.thumbnailPath,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
            <span className="text-sm text-blue-600">Loading video information...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!videoInfo) {
    return null;
  }

  return (
    <Card className="border-green-200 bg-green-50">
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <div className="flex h-16 w-28 items-center justify-center rounded bg-gray-200">
              {isThumbnailLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
              ) : thumbnailDataUrl ? (
                <img
                  src={thumbnailDataUrl}
                  alt="Video thumbnail"
                  className="h-16 w-28 rounded object-cover"
                  onError={(e) => {
                    console.error("Failed to load thumbnail image");
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className="text-center text-xs text-gray-400">No thumbnail</div>
              )}
            </div>
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
  );
}
