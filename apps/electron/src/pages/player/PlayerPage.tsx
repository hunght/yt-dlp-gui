import React, { useRef, useState, useEffect, useCallback } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Rewind, FastForward } from "lucide-react";
import { useWatchProgress } from "./hooks/useWatchProgress";
import { VideoPlayer } from "./components/VideoPlayer";
import { DownloadStatus } from "./components/DownloadStatus";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { AnnotationForm } from "./components/AnnotationForm";
import { PlaylistNavigation } from "./components/PlaylistNavigation";
import { rightSidebarContentAtom, annotationsSidebarDataAtom } from "@/context/rightSidebar";
import { trpcClient } from "@/utils/trpc";

export default function PlayerPage() {
  const search = useSearch({ from: "/player" });
  const videoId = search.videoId as string | undefined;
  const playlistId = search.playlistId as string | undefined;
  const playlistIndex = search.playlistIndex as number | undefined;

  // Video reference for playback control
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ============================================================================
  // VIDEO PLAYBACK (previously in useVideoPlayback hook)
  // ============================================================================

  const { data: playback, isLoading: playbackIsLoading } = useQuery({
    queryKey: ["video-playback", videoId],
    queryFn: async () => {
      if (!videoId) return null;
      return await trpcClient.ytdlp.getVideoPlayback.query({ videoId });
    },
    enabled: !!videoId,
    refetchInterval: (q) => {
      const status = (q.state.data as any)?.status as string | undefined;
      if (!status) return false;
      return ["downloading", "queued", "paused"].includes(status) ? 1500 : false;
    },
  });

  const startDownloadMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing videoId");
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      return await trpcClient.queue.addToQueue.mutate({ urls: [url] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-playback", videoId] });
    },
  });

  // Auto-start download once if file is missing and not already downloading
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!videoId) return;
    if (playback?.filePath) return; // We already have the file

    const st = (playback?.status as string | undefined) || undefined;
    const isActive = st && ["downloading", "queued", "paused"].includes(st);

    if (!isActive && !autoStartedRef.current) {
      autoStartedRef.current = true;
      startDownloadMutation.mutate();
    }
  }, [videoId, playback?.filePath, playback?.status, startDownloadMutation]);

  // When status flips to completed but filePath not yet populated, force a refresh once
  const completionRefetchRef = useRef(false);
  useEffect(() => {
    if (!videoId) return;
    if (playback?.filePath) return;
    if ((playback?.status as string | undefined) === "completed" && !completionRefetchRef.current) {
      completionRefetchRef.current = true;
      queryClient.invalidateQueries({ queryKey: ["video-playback", videoId] });
    }
  }, [playback?.status, playback?.filePath, videoId, queryClient]);

  // ============================================================================
  // WATCH PROGRESS (using existing useWatchProgress hook - complex reusable logic)
  // ============================================================================

  const { currentTime, handleTimeUpdate } = useWatchProgress(
    videoId,
    videoRef,
    playback?.lastPositionSeconds
  );

  // ============================================================================
  // PLAYLIST NAVIGATION (previously in usePlaylistNavigation hook)
  // ============================================================================

  // Fetch playlist details if we have a playlistId
  const playlistQuery = useQuery({
    queryKey: ["playlist-details", playlistId],
    queryFn: async () => {
      if (!playlistId) return null;
      return await trpcClient.playlists.getDetails.query({ playlistId });
    },
    enabled: !!playlistId,
    staleTime: Infinity,
    gcTime: Infinity,
    networkMode: "offlineFirst",
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Update playback position mutation
  const updatePlaybackMutation = useMutation({
    mutationFn: ({ videoIndex, watchTime }: { videoIndex: number; watchTime?: number }) =>
      trpcClient.playlists.updatePlayback.mutate({
        playlistId: playlistId!,
        currentVideoIndex: videoIndex,
        watchTimeSeconds: watchTime,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ytdlp", "all-playlists"] });
    },
  });

  const playlistData = playlistQuery.data as any | null;
  const playlistVideos = playlistData?.videos || [];
  const playlistCurrentIndex = playlistIndex ?? 0;

  // Check if there's a next/previous video
  const playlistHasNext = playlistCurrentIndex < playlistVideos.length - 1;
  const playlistHasPrevious = playlistCurrentIndex > 0;

  // Navigate to next video
  const goToNextVideo = useCallback(() => {
    if (!playlistHasNext || !playlistId) return;

    const nextIndex = playlistCurrentIndex + 1;
    const nextVideo = playlistVideos[nextIndex];

    if (nextVideo) {
      updatePlaybackMutation.mutate({ videoIndex: nextIndex });
      navigate({
        to: "/player",
        search: {
          videoId: nextVideo.videoId,
          playlistId,
          playlistIndex: nextIndex,
        },
      });
    }
  }, [
    playlistHasNext,
    playlistId,
    playlistCurrentIndex,
    playlistVideos,
    updatePlaybackMutation,
    navigate,
  ]);

  // Navigate to previous video
  const goToPreviousVideo = useCallback(() => {
    if (!playlistHasPrevious || !playlistId) return;

    const previousIndex = playlistCurrentIndex - 1;
    const previousVideo = playlistVideos[previousIndex];

    if (previousVideo) {
      updatePlaybackMutation.mutate({ videoIndex: previousIndex });
      navigate({
        to: "/player",
        search: {
          videoId: previousVideo.videoId,
          playlistId,
          playlistIndex: previousIndex,
        },
      });
    }
  }, [
    playlistHasPrevious,
    playlistId,
    playlistCurrentIndex,
    playlistVideos,
    updatePlaybackMutation,
    navigate,
  ]);

  const isPlaylist = !!playlistId && !!playlistData;
  const playlistTitle = playlistData?.title;
  const playlistTotalVideos = playlistVideos.length;

  // Right sidebar atoms
  const setRightSidebarContent = useSetAtom(rightSidebarContentAtom);
  const setAnnotationsSidebarData = useSetAtom(annotationsSidebarDataAtom);

  // Global scroll-to-seek indicator
  const [seekIndicator, setSeekIndicator] = useState<{
    direction: "forward" | "backward";
    amount: number;
  } | null>(null);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const filePath = playback?.filePath || null;
  const videoTitle = playback?.title || playback?.videoId || "Video";

  // Set sidebar to show annotations when on PlayerPage
  useEffect(() => {
    setRightSidebarContent("annotations");

    // Only set data when we have videoId
    if (videoId) {
      setAnnotationsSidebarData({
        videoId,
        videoRef,
        videoTitle: playback?.title || undefined,
        videoDescription: playback?.description || undefined,
        currentTime,
      });
    }

    // Reset to queue when leaving PlayerPage
    return () => {
      setRightSidebarContent("queue");
      setAnnotationsSidebarData(null);
    };
  }, [
    setRightSidebarContent,
    setAnnotationsSidebarData,
    videoId,
    videoRef,
    playback?.title,
    playback?.description,
    currentTime,
  ]);

  // Global scroll-to-seek (works anywhere on the page when video is playing)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !filePath) return; // Only active when video is loaded

    const handleWheel = (e: WheelEvent) => {
      // Prevent default scrolling
      e.preventDefault();

      // Determine seek direction and amount
      const seekAmount = 5; // seconds per scroll tick
      const direction = e.deltaY < 0 ? "backward" : "forward";
      const delta = direction === "forward" ? seekAmount : -seekAmount;

      // Seek the video
      const newTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
      video.currentTime = newTime;

      // Show visual feedback
      setSeekIndicator({ direction, amount: seekAmount });

      // Clear previous timeout
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }

      // Hide indicator after 800ms
      seekTimeoutRef.current = setTimeout(() => {
        setSeekIndicator(null);
      }, 800);
    };

    // Add wheel listener with passive: false to allow preventDefault
    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("wheel", handleWheel);
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, [filePath]); // Re-run when file path changes (video loads)

  return (
    <div className="container relative mx-auto space-y-6 p-6">
      {/* Global Seek Indicator Overlay */}
      {seekIndicator && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-lg bg-black/80 px-6 py-4 shadow-lg backdrop-blur-sm duration-200 animate-in fade-in zoom-in-95">
            {seekIndicator.direction === "backward" ? (
              <>
                <Rewind className="h-8 w-8 text-white" />
                <div className="text-white">
                  <p className="text-2xl font-bold">-{seekIndicator.amount}s</p>
                  <p className="text-xs text-white/70">Backward</p>
                </div>
              </>
            ) : (
              <>
                <div className="text-right text-white">
                  <p className="text-2xl font-bold">+{seekIndicator.amount}s</p>
                  <p className="text-xs text-white/70">Forward</p>
                </div>
                <FastForward className="h-8 w-8 text-white" />
              </>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{videoTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {playbackIsLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !videoId ? (
            <Alert>
              <AlertTitle>Missing video</AlertTitle>
              <AlertDescription>No video id provided.</AlertDescription>
            </Alert>
          ) : !playback ? (
            <Alert>
              <AlertTitle>Not found</AlertTitle>
              <AlertDescription>Could not find that video.</AlertDescription>
            </Alert>
          ) : !filePath ? (
            <DownloadStatus
              videoId={videoId}
              status={playback?.status as string | undefined}
              progress={playback?.progress ?? null}
              onStartDownload={() => startDownloadMutation.mutate()}
              isStarting={startDownloadMutation.isPending}
            />
          ) : (
            <div className="space-y-4">
              <VideoPlayer
                filePath={filePath}
                videoRef={videoRef}
                onTimeUpdate={handleTimeUpdate}
              />

              {/* Transcript - Self-contained, owns all its state */}
              <TranscriptPanel
                videoId={videoId}
                currentTime={currentTime}
                videoRef={videoRef}
                playbackData={playback}
              />

              {/* Playlist Navigation - Show when playing from a playlist */}
              {isPlaylist && (
                <PlaylistNavigation
                  playlistTitle={playlistTitle}
                  currentIndex={playlistCurrentIndex}
                  totalVideos={playlistTotalVideos}
                  hasNext={playlistHasNext}
                  hasPrevious={playlistHasPrevious}
                  onNext={goToNextVideo}
                  onPrevious={goToPreviousVideo}
                />
              )}

              {/* Annotation Form Dialog - Self-contained, owns all its state */}
              <AnnotationForm videoId={videoId} currentTime={currentTime} videoRef={videoRef} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
