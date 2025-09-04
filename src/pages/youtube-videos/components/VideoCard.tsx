import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Eye, Heart, Calendar, User } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";
import { Video } from "../types";
import { formatDuration, formatViewCount, formatDate } from "../utils/formatters";

interface VideoCardProps {
  video: Video;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video }) => {
  // Open YouTube video
  const openYouTubeVideo = (videoId: string) => {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank");
  };

  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-lg">
      <div className="relative">
        <Thumbnail
          thumbnailPath={video.thumbnailPath}
          alt={video.title}
          className="aspect-video w-full rounded-t-lg object-cover"
          fallbackIcon={<Play className="h-12 w-12 text-gray-400" />}
        />

        {video.durationSeconds && (
          <Badge className="absolute bottom-2 right-2 bg-black/80 text-white">
            {formatDuration(video.durationSeconds)}
          </Badge>
        )}
      </div>

      <CardContent className="p-4">
        <h3 className="mb-2 line-clamp-2 text-lg font-semibold hover:line-clamp-none">
          {video.title}
        </h3>

        {video.channelTitle && (
          <p className="mb-2 flex items-center gap-1 text-sm text-gray-600">
            <User className="h-4 w-4" />
            {video.channelTitle}
          </p>
        )}

        <div className="mb-3 flex items-center gap-4 text-sm text-gray-500">
          {video.viewCount !== null && (
            <span className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              {formatViewCount(video.viewCount)}
            </span>
          )}
          {video.likeCount !== null && (
            <span className="flex items-center gap-1">
              <Heart className="h-4 w-4" />
              {formatViewCount(video.likeCount)}
            </span>
          )}
          {video.publishedAt && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(video.publishedAt)}
            </span>
          )}
        </div>

        {video.description && (
          <p className="mb-3 line-clamp-2 text-sm text-gray-600">{video.description}</p>
        )}

        <div className="flex gap-2">
          <Button size="sm" onClick={() => openYouTubeVideo(video.videoId)} className="flex-1">
            <Play className="mr-1 h-4 w-4" />
            Watch on YouTube
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
