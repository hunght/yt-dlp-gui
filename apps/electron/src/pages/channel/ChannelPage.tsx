import React from "react";
import { useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExternalLink as ExternalLinkIcon, Download, Play, CheckCircle, Loader2, XCircle } from "lucide-react";
import { ExternalLink } from "@/components/ExternalLink";
import { toast } from "sonner";

const getDownloadStatusIcon = (status: string | null) => {
  if (!status) return null;

  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case "downloading":
    case "queued":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-600" />;
    case "paused":
      return <span className="text-xs text-muted-foreground">⏸</span>;
    default:
      return null;
  }
};

const getDownloadStatusText = (status: string | null, progress: number | null) => {
  if (!status) return null;

  switch (status) {
    case "completed":
      return "Downloaded";
    case "downloading":
      return `Downloading ${progress || 0}%`;
    case "queued":
      return "In Queue";
    case "failed":
      return "Failed";
    case "paused":
      return "Paused";
    default:
      return status;
  }
};

export default function ChannelPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/channel" });
  const channelId = search.channelId;

  const { data, isLoading, error } = useQuery({
    queryKey: ["channel", channelId],
    queryFn: async () => {
      if (!channelId) return null;
      return await trpcClient.ytdlp.getChannelDetails.query({ channelId });
    },
    enabled: !!channelId,
    refetchInterval: 3000, // Refresh every 3 seconds to update download statuses
  });

  const latestQuery = useQuery({
    queryKey: ["channel-latest", channelId],
    queryFn: () => trpcClient.ytdlp.listChannelLatest.query({ channelId: channelId!, limit: 24 }),
    enabled: !!channelId,
  });
  const popularQuery = useQuery({
    queryKey: ["channel-popular", channelId],
    queryFn: () => trpcClient.ytdlp.listChannelPopular.query({ channelId: channelId!, limit: 24 }),
    enabled: !!channelId,
  });
  const playlistsQuery = useQuery({
    queryKey: ["channel-playlists", channelId],
    queryFn: () => trpcClient.ytdlp.listChannelPlaylists.query({ channelId: channelId!, limit: 24 }),
    enabled: !!channelId,
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

  const { channel, videos } = data;
  const thumbnailSrc = channel.thumbnailPath
    ? `local-file://${channel.thumbnailPath}`
    : channel.thumbnailUrl;

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
            {thumbnailSrc ? (
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
                <span>{videos.length} videos</span>
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
          <Tabs defaultValue="latest">
            <TabsList>
              <TabsTrigger value="latest">Latest</TabsTrigger>
              <TabsTrigger value="popular">Popular</TabsTrigger>
              <TabsTrigger value="library">Library</TabsTrigger>
              <TabsTrigger value="playlists">Playlists</TabsTrigger>
            </TabsList>

            <TabsContent value="latest" className="mt-4">
              {latestQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading latest…</p>
              ) : latestQuery.data && latestQuery.data.length > 0 ? (
                <div className="space-y-4">
                  {latestQuery.data.map((video) => {
                    const videoThumbnail = video.thumbnailPath
                      ? `local-file://${video.thumbnailPath}`
                      : video.thumbnailUrl;
                    const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

                    return (
                      <div key={video.id} className="flex items-start gap-4 rounded-lg border p-4">
                        {/* Video Thumbnail */}
                        {videoThumbnail ? (
                          <img
                            src={videoThumbnail}
                            alt={video.title}
                            className="h-24 w-40 flex-shrink-0 rounded object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="h-24 w-40 flex-shrink-0 rounded bg-muted" />
                        )}

                        {/* Video Info */}
                        <div className="flex-1 space-y-1">
                          <h3 className="font-medium line-clamp-2">{video.title}</h3>

                          {video.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {video.description}
                            </p>
                          )}

                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {video.viewCount && (
                              <span>{video.viewCount.toLocaleString()} views</span>
                            )}
                            {video.publishedAt && (
                              <span>{new Date(video.publishedAt).toLocaleDateString()}</span>
                            )}
                            {video.durationSeconds && (
                              <span>
                                {Math.floor(video.durationSeconds / 60)}:
                                {String(video.durationSeconds % 60).padStart(2, "0")}
                              </span>
                            )}
                          </div>

                          {/* Download Status */}
                          {video.downloadStatus && (
                            <div className="flex items-center gap-2 mt-2">
                              {getDownloadStatusIcon(video.downloadStatus)}
                              <span className="text-xs font-medium">
                                {getDownloadStatusText(video.downloadStatus, video.downloadProgress)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2">
                          {video.downloadStatus === "completed" && video.downloadFilePath ? (
                            <>
                              <Link
                                to="/player"
                                search={{ videoId: video.videoId as string }}
                                className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90"
                              >
                                <Play className="h-3 w-3" />
                                Play
                              </Link>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.preventDefault();
                                  trpcClient.utils.openExternalUrl.mutate({ url: videoUrl });
                                }}
                              >
                                <ExternalLinkIcon className="mr-1 h-3 w-3" />
                                View
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownloadVideo(videoUrl, video.title)}
                                disabled={video.downloadStatus === "downloading" || video.downloadStatus === "queued"}
                              >
                                <Download className="mr-1 h-3 w-3" />
                                Download
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.preventDefault();
                                  trpcClient.utils.openExternalUrl.mutate({ url: videoUrl });
                                }}
                              >
                                <ExternalLinkIcon className="mr-1 h-3 w-3" />
                                View
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No latest items.</p>
              )}
            </TabsContent>

            <TabsContent value="popular" className="mt-4">
              {popularQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading popular…</p>
              ) : popularQuery.data && popularQuery.data.length > 0 ? (
                <div className="space-y-4">
                  {popularQuery.data.map((video) => {
                    const videoThumbnail = video.thumbnailPath
                      ? `local-file://${video.thumbnailPath}`
                      : video.thumbnailUrl;
                    const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

                    return (
                      <div key={video.id} className="flex items-start gap-4 rounded-lg border p-4">
                        {/* Video Thumbnail */}
                        {videoThumbnail ? (
                          <img
                            src={videoThumbnail}
                            alt={video.title}
                            className="h-24 w-40 flex-shrink-0 rounded object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="h-24 w-40 flex-shrink-0 rounded bg-muted" />
                        )}

                        {/* Video Info */}
                        <div className="flex-1 space-y-1">
                          <h3 className="font-medium line-clamp-2">{video.title}</h3>

                          {video.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {video.description}
                            </p>
                          )}

                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {video.viewCount && (
                              <span>{video.viewCount.toLocaleString()} views</span>
                            )}
                            {video.publishedAt && (
                              <span>{new Date(video.publishedAt).toLocaleDateString()}</span>
                            )}
                            {video.durationSeconds && (
                              <span>
                                {Math.floor(video.durationSeconds / 60)}:
                                {String(video.durationSeconds % 60).padStart(2, "0")}
                              </span>
                            )}
                          </div>

                          {/* Download Status */}
                          {video.downloadStatus && (
                            <div className="flex items-center gap-2 mt-2">
                              {getDownloadStatusIcon(video.downloadStatus)}
                              <span className="text-xs font-medium">
                                {getDownloadStatusText(video.downloadStatus, video.downloadProgress)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2">
                          {video.downloadStatus === "completed" && video.downloadFilePath ? (
                            <>
                              <Link
                                to="/player"
                                search={{ videoId: video.videoId as string }}
                                className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90"
                              >
                                <Play className="h-3 w-3" />
                                Play
                              </Link>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.preventDefault();
                                  trpcClient.utils.openExternalUrl.mutate({ url: videoUrl });
                                }}
                              >
                                <ExternalLinkIcon className="mr-1 h-3 w-3" />
                                View
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownloadVideo(videoUrl, video.title)}
                                disabled={video.downloadStatus === "downloading" || video.downloadStatus === "queued"}
                              >
                                <Download className="mr-1 h-3 w-3" />
                                Download
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.preventDefault();
                                  trpcClient.utils.openExternalUrl.mutate({ url: videoUrl });
                                }}
                              >
                                <ExternalLinkIcon className="mr-1 h-3 w-3" />
                                View
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No popular items.</p>
              )}
            </TabsContent>

            <TabsContent value="library" className="mt-4">
              {videos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No videos found for this channel in library.</p>
              ) : (
                <div className="space-y-4">
                  {videos.map((video) => {
                const videoThumbnail = video.thumbnailPath
                  ? `local-file://${video.thumbnailPath}`
                  : video.thumbnailUrl;
                const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

                return (
                  <div key={video.id} className="flex items-start gap-4 rounded-lg border p-4">
                    {/* Video Thumbnail */}
                    {videoThumbnail ? (
                      <img
                        src={videoThumbnail}
                        alt={video.title}
                        className="h-24 w-40 flex-shrink-0 rounded object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="h-24 w-40 flex-shrink-0 rounded bg-muted" />
                    )}

                    {/* Video Info */}
                    <div className="flex-1 space-y-1">
                      <h3 className="font-medium line-clamp-2">{video.title}</h3>

                      {video.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {video.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {video.viewCount && (
                          <span>{video.viewCount.toLocaleString()} views</span>
                        )}
                        {video.publishedAt && (
                          <span>{new Date(video.publishedAt).toLocaleDateString()}</span>
                        )}
                        {video.durationSeconds && (
                          <span>
                            {Math.floor(video.durationSeconds / 60)}:
                            {String(video.durationSeconds % 60).padStart(2, "0")}
                          </span>
                        )}
                      </div>

                      {/* Download Status */}
                      {video.downloadStatus && (
                        <div className="flex items-center gap-2 mt-2">
                          {getDownloadStatusIcon(video.downloadStatus)}
                          <span className="text-xs font-medium">
                            {getDownloadStatusText(video.downloadStatus, video.downloadProgress)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                      {video.downloadStatus === "completed" && video.downloadFilePath ? (
                        <>
                          <Link
                            to="/player"
                            search={{ videoId: video.videoId as string }}
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90"
                          >
                            <Play className="h-3 w-3" />
                            Play
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.preventDefault();
                              trpcClient.utils.openExternalUrl.mutate({ url: videoUrl });
                            }}
                          >
                            <ExternalLinkIcon className="mr-1 h-3 w-3" />
                            View
                          </Button>
                        </>
                      ) : video.downloadStatus && ["downloading", "queued", "paused"].includes(video.downloadStatus) ? (
                        <Button size="sm" variant="secondary" disabled>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          {video.downloadStatus === "downloading" ? "Downloading" : video.downloadStatus === "queued" ? "Queued" : "Paused"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadVideo(videoUrl, video.title)}
                          disabled={addToQueueMutation.isPending}
                        >
                          <Download className="mr-1 h-3 w-3" />
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="playlists" className="mt-4">
              {playlistsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading playlists…</p>
              ) : playlistsQuery.data && playlistsQuery.data.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {playlistsQuery.data.map((p: any) => (
                    <div key={p.id} className="flex items-start justify-between gap-3 rounded border p-3">
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm font-medium">{p.title}</div>
                        <ExternalLink href={p.url} className="text-xs text-blue-600" showIcon={false}>
                          Open playlist
                        </ExternalLink>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault();
                          trpcClient.utils.openExternalUrl.mutate({ url: p.url });
                        }}
                      >
                        <ExternalLinkIcon className="mr-1 h-3 w-3" />
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No playlists.</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
