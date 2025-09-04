import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "../utils/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Play, Eye, Heart, Calendar, User, Filter, SortAsc, SortDesc } from "lucide-react";

interface Video {
  id: string;
  videoId: string;
  title: string;
  description: string | null;
  channelId: string | null;
  channelTitle: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  likeCount: number | null;
  thumbnailUrl: string | null;
  publishedAt: number | null;
  tags: string | null;
  createdAt: number;
  updatedAt: number | null;
}

interface Channel {
  channelId: string | null;
  channelTitle: string | null;
  videoCount: number;
}

const YouTubeVideosPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<
    "createdAt" | "publishedAt" | "title" | "viewCount" | "likeCount"
  >("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedChannel, setSelectedChannel] = useState<string>("all");

  // Fetch videos
  const {
    data: videosData,
    isLoading: videosLoading,
    error: videosError,
  } = useQuery({
    queryKey: ["videos", currentPage, searchQuery, sortBy, sortOrder, selectedChannel],
    queryFn: async () => {
      try {
        const result = await trpcClient.youtube.getVideos.query({
          page: currentPage,
          limit: 20,
          search: searchQuery || undefined,
          channelId: selectedChannel === "all" ? undefined : selectedChannel,
          sortBy,
          sortOrder,
        });
        return result;
      } catch (error) {
        console.error("Error fetching videos:", error);
        throw error;
      }
    },
  });

  // Fetch video statistics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["videoStats"],
    queryFn: async () => {
      try {
        return await trpcClient.youtube.getVideoStats.query();
      } catch (error) {
        console.error("Error fetching video stats:", error);
        throw error;
      }
    },
  });

  // Fetch channels for filtering
  const { data: channelsData } = useQuery({
    queryKey: ["channels"],
    queryFn: async () =>
      await trpcClient.youtube.getChannels.query({
        page: 1,
        limit: 100, // Get all channels for filtering
      }),
  });

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  // Handle sort change
  const handleSortChange = (newSortBy: typeof sortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(newSortBy);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  // Handle channel change
  const handleChannelChange = (value: string) => {
    setSelectedChannel(value);
    setCurrentPage(1);
  };

  // Format duration
  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "Unknown";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  // Format view count
  const formatViewCount = (count: number | null): string => {
    if (!count) return "0";
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  // Format date
  const formatDate = (timestamp: number | null): string => {
    if (!timestamp) return "Unknown";
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  // Open YouTube video
  const openYouTubeVideo = (videoId: string) => {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank");
  };

  if (videosError) {
    console.error("Videos error:", videosError);
    return (
      <div className="container mx-auto p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <h2 className="mb-2 text-xl font-semibold text-red-800">Error Loading Videos</h2>
            <p className="text-red-600">
              {videosError instanceof Error ? videosError.message : "An unknown error occurred"}
            </p>
            <Button onClick={() => window.location.reload()} className="mt-4" variant="outline">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">YouTube Videos</h1>
          <p className="mt-1 text-gray-600">Browse and search your downloaded videos</p>
        </div>

        {/* Stats Cards */}
        {!statsLoading && stats && (
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
        )}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Search & Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSearch} className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
                <Input
                  placeholder="Search videos by title, description, or channel..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={selectedChannel} onValueChange={handleChannelChange}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                {channelsData?.channels?.map((channel: Channel) => (
                  <SelectItem key={channel.channelId} value={channel.channelId || "unknown"}>
                    {channel.channelTitle || "Unknown Channel"} ({channel.videoCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button type="submit" className="w-full sm:w-auto">
              Search
            </Button>
          </form>

          {/* Sort Options */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Sort by:</span>

            {[
              { key: "createdAt", label: "Date Added", icon: Calendar },
              { key: "publishedAt", label: "Published Date", icon: Calendar },
              { key: "title", label: "Title", icon: null },
              { key: "viewCount", label: "Views", icon: Eye },
              { key: "likeCount", label: "Likes", icon: Heart },
            ].map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                variant={sortBy === key ? "default" : "outline"}
                size="sm"
                onClick={() => handleSortChange(key as typeof sortBy)}
                className="flex items-center gap-1"
              >
                {Icon && <Icon className="h-4 w-4" />}
                {label}
                {sortBy === key &&
                  (sortOrder === "asc" ? (
                    <SortAsc className="h-4 w-4" />
                  ) : (
                    <SortDesc className="h-4 w-4" />
                  ))}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Videos Grid */}
      {videosLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="aspect-video rounded-t-lg bg-gray-200" />
              <CardContent className="p-4">
                <div className="mb-2 h-4 rounded bg-gray-200" />
                <div className="h-3 w-3/4 rounded bg-gray-200" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : videosData?.videos && videosData.videos.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {videosData.videos.map((video: Video) => (
              <Card key={video.id} className="cursor-pointer transition-shadow hover:shadow-lg">
                <div className="relative">
                  {video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="aspect-video w-full rounded-t-lg object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded-t-lg bg-gray-200">
                      <Play className="h-12 w-12 text-gray-400" />
                    </div>
                  )}

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
                    <Button
                      size="sm"
                      onClick={() => openYouTubeVideo(video.videoId)}
                      className="flex-1"
                    >
                      <Play className="mr-1 h-4 w-4" />
                      Watch on YouTube
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {videosData.pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={!videosData.pagination.hasPrevPage}
              >
                Previous
              </Button>

              <span className="text-sm text-gray-600">
                Page {currentPage} of {videosData.pagination.totalPages}
              </span>

              <Button
                variant="outline"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={!videosData.pagination.hasNextPage}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Play className="mx-auto mb-4 h-16 w-16 text-gray-400" />
            <h3 className="mb-2 text-xl font-semibold text-gray-600">No videos found</h3>
            <p className="text-gray-500">
              {searchQuery || selectedChannel
                ? "Try adjusting your search criteria or filters"
                : "Start by downloading some YouTube videos to see them here"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default YouTubeVideosPage;
