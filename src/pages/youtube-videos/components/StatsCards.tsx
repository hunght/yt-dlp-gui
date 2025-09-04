import React from "react";
import { Badge } from "@/components/ui/badge";
import { Eye, Heart, Play } from "lucide-react";
import { VideoStats } from "../types";
import { formatViewCount } from "../utils/formatters";

interface StatsCardsProps {
  stats: VideoStats;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats }) => {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary" className="px-3 py-1">
        <Eye className="mr-1 h-4 w-4" />
        {formatViewCount(stats.totalViews)} views
      </Badge>
      <Badge variant="secondary" className="px-3 py-1">
        <Heart className="mr-1 h-4 w-4" />
        {formatViewCount(stats.totalLikes)} likes
      </Badge>
      <Badge variant="secondary" className="px-3 py-1">
        <Play className="mr-1 h-4 w-4" />
        {stats.totalVideos} videos
      </Badge>
    </div>
  );
};
