import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Play } from "lucide-react";
import { VideoInfo } from "@/api/types";
import Thumbnail from "@/components/Thumbnail";

interface VideoInfoCardProps {
  videoInfo: VideoInfo | null;
  isLoading: boolean;
}

export default function VideoInfoCard({ videoInfo, isLoading }: VideoInfoCardProps) {
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
            <Thumbnail
              thumbnailPath={videoInfo.thumbnailPath}
              alt="Video thumbnail"
              className="h-16 w-28 rounded"
              fallbackIcon={<div className="text-center text-xs text-gray-400">No thumbnail</div>}
            />
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
