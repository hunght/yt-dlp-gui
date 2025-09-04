import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "../../utils/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";

import { SearchFilters } from "./components/SearchFilters";
import { StatsCards } from "./components/StatsCards";
import { VideoCard } from "./components/VideoCard";
import { Pagination } from "./components/Pagination";

import { Video } from "./types";

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
        {!statsLoading && stats && <StatsCards stats={stats} />}
      </div>

      {/* Search and Filters */}
      <SearchFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedChannel={selectedChannel}
        handleChannelChange={handleChannelChange}
        channelsData={channelsData}
        handleSearch={handleSearch}
        sortBy={sortBy}
        sortOrder={sortOrder}
        handleSortChange={handleSortChange}
      />

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
              <VideoCard key={video.id} video={video} />
            ))}
          </div>

          {/* Pagination */}
          {videosData.pagination.totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={videosData.pagination.totalPages}
              hasPrevPage={videosData.pagination.hasPrevPage}
              hasNextPage={videosData.pagination.hasNextPage}
              onPageChange={setCurrentPage}
            />
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
