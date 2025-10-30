import React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExternalLink } from "@/components/ExternalLink";
import { toast } from "sonner";
import { LatestTab, PopularTab, LibraryTab, PlaylistsTab } from "./components";

export default function ChannelPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/channel" });
  const channelId = search.channelId;

  // Track active tab for lazy loading
  const [activeTab, setActiveTab] = React.useState("latest");

  const { data, isLoading, error } = useQuery({
    queryKey: ["channel", channelId],
    queryFn: async () => {
      if (!channelId) return null;
      return await trpcClient.ytdlp.getChannelDetails.query({ channelId });
    },
    enabled: !!channelId,
  });

  // Separate query for library videos - fetches directly from DB with download status updates
  // Only show videos that have been downloaded or are in download process
  const libraryQuery = useQuery({
    queryKey: ["channel-library", channelId],
    queryFn: async () => {
      if (!channelId) return [];
      const videos = await trpcClient.ytdlp.getVideosByChannel.query({ channelId: channelId!, limit: 100 });
      // Filter to only show videos with download activity
      return videos.filter((v) =>
        v.downloadStatus &&
        ["downloading", "queued", "completed", "paused", "failed"].includes(v.downloadStatus)
      );
    },
    enabled: !!channelId && activeTab === "library", // Only fetch when library tab is active
    refetchInterval: activeTab === "library" ? 3000 : false, // Only poll when tab is active
    staleTime: 0, // Always fetch fresh data to show latest download status
  });

  const addToQueueMutation = useMutation({
    mutationFn: (url: string) => trpcClient.queue.addToQueue.mutate({ urls: [url], priority: 0 }),
  });

  const handleDownloadVideo = async (videoUrl: string, videoTitle: string) => {
    try {
      const result = await addToQueueMutation.mutateAsync(videoUrl);

      if (result.success) {
        toast.success(`Added "${videoTitle}" to download queue`);
      } else {
        toast.error(result.message || "Failed to add to queue");
      }
    } catch (err) {
      toast.error("Failed to add video to queue");
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <Button variant="ghost" onClick={() => navigate({ to: "/" })}>
          ← Back
        </Button>
        <p className="text-sm text-muted-foreground">Loading channel...</p>
      </div>
    );
  }

  if (!channelId) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <Button variant="ghost" onClick={() => navigate({ to: "/" })}>
          ← Back
        </Button>
        <Alert>
          <AlertTitle>Missing channel</AlertTitle>
          <AlertDescription>No channel ID provided.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data || !data.channel) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <Button variant="ghost" onClick={() => navigate({ to: "/" })}>
          ← Back
        </Button>
        <Alert>
          <AlertTitle>Channel not found</AlertTitle>
          <AlertDescription>Could not find channel with ID: {channelId}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { channel } = data;
  const isAllowedImageSrc = (src?: string | null) => {
    if (!src) return false;
    if (src.startsWith("local-file://")) return true;
    try {
      const u = new URL(src);
      return /(^|\.)ytimg\.com$/.test(u.hostname);
    } catch {
      return false;
    }
  };
  const thumbnailSrc = channel.thumbnailPath
    ? `local-file://${channel.thumbnailPath}`
    : (isAllowedImageSrc(channel.thumbnailUrl) ? channel.thumbnailUrl : undefined);

  return (
    <div className="container mx-auto space-y-6 p-6">
      <Button variant="ghost" onClick={() => navigate({ to: "/" })}>
        ← Back
      </Button>

      {/* Channel Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-6">
            {/* Channel Avatar */}
            {thumbnailSrc && isAllowedImageSrc(thumbnailSrc) ? (
              <img
                src={thumbnailSrc}
                alt={channel.channelTitle}
                className="h-24 w-24 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="h-24 w-24 rounded-full bg-muted" />
            )}

            {/* Channel Info */}
            <div className="flex-1 space-y-2">
              <h1 className="text-2xl font-bold">{channel.channelTitle}</h1>

              {channel.channelDescription && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {channel.channelDescription}
                </p>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {channel.subscriberCount && (
                  <span>{channel.subscriberCount.toLocaleString()} subscribers</span>
                )}
                {libraryQuery.data && libraryQuery.data.length > 0 && (
                  <span>{libraryQuery.data.length} videos in library</span>
                )}
                {channel.customUrl && <span>@{channel.customUrl}</span>}
              </div>

              {channel.channelUrl && (
                <ExternalLink
                  href={channel.channelUrl}
                  className="text-sm text-blue-600"
                  showIcon={true}
                  iconClassName="h-3 w-3"
                >
                  View on YouTube
                </ExternalLink>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Videos and Discovery */}
      <Card>
        <CardHeader>
          <CardTitle>Videos</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="latest" value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="latest">Latest</TabsTrigger>
              <TabsTrigger value="popular">Popular</TabsTrigger>
              <TabsTrigger value="library">Library</TabsTrigger>
              <TabsTrigger value="playlists">Playlists</TabsTrigger>
            </TabsList>

            <TabsContent value="latest" className="mt-4">
              <LatestTab
                channelId={channelId!}
                isActive={activeTab === "latest"}
                onDownload={handleDownloadVideo}
              />
            </TabsContent>

            <TabsContent value="popular" className="mt-4">
              <PopularTab
                channelId={channelId!}
                isActive={activeTab === "popular"}
                onDownload={handleDownloadVideo}
              />
            </TabsContent>

            <TabsContent value="library" className="mt-4">
              <LibraryTab
                channelId={channelId!}
                isActive={activeTab === "library"}
              />
            </TabsContent>

            <TabsContent value="playlists" className="mt-4">
              <PlaylistsTab
                channelId={channelId!}
                isActive={activeTab === "playlists"}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
