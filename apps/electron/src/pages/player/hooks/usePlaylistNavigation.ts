import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";

interface PlaylistNavigationProps {
  playlistId?: string;
  playlistIndex?: number;
  videoId?: string;
}

export function usePlaylistNavigation({
  playlistId,
  playlistIndex,
  videoId,
}: PlaylistNavigationProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch playlist details if we have a playlistId
  const playlistQuery = useQuery({
    queryKey: ["playlist-details", playlistId],
    queryFn: async () => {
      if (!playlistId) return null;
      return await trpcClient.ytdlp.getPlaylistDetails.query({ playlistId });
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
      trpcClient.ytdlp.updatePlaylistPlayback.mutate({
        playlistId: playlistId!,
        currentVideoIndex: videoIndex,
        watchTimeSeconds: watchTime,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ytdlp", "all-playlists"] });
    },
  });

  const playlistData = playlistQuery.data as any | null;
  const videos = playlistData?.videos || [];
  const currentIndex = playlistIndex ?? 0;

  // Check if there's a next video
  const hasNext = currentIndex < videos.length - 1;

  // Check if there's a previous video
  const hasPrevious = currentIndex > 0;

  // Navigate to next video
  const goToNext = useCallback(() => {
    if (!hasNext || !playlistId) return;

    const nextIndex = currentIndex + 1;
    const nextVideo = videos[nextIndex];

    if (nextVideo) {
      updatePlaybackMutation.mutate({ videoIndex: nextIndex });
      navigate({
        to: "/player",
        search: {
          videoId: nextVideo.videoId,
          playlistId: playlistId,
          playlistIndex: nextIndex,
        },
      });
    }
  }, [hasNext, playlistId, currentIndex, videos, updatePlaybackMutation, navigate]);

  // Navigate to previous video
  const goToPrevious = useCallback(() => {
    if (!hasPrevious || !playlistId) return;

    const previousIndex = currentIndex - 1;
    const previousVideo = videos[previousIndex];

    if (previousVideo) {
      updatePlaybackMutation.mutate({ videoIndex: previousIndex });
      navigate({
        to: "/player",
        search: {
          videoId: previousVideo.videoId,
          playlistId: playlistId,
          playlistIndex: previousIndex,
        },
      });
    }
  }, [hasPrevious, playlistId, currentIndex, videos, updatePlaybackMutation, navigate]);

  // Get current video info
  const currentVideo = videos[currentIndex];
  const totalVideos = videos.length;

  return {
    // Playlist info
    isPlaylist: !!playlistId && !!playlistData,
    playlistTitle: playlistData?.title,
    currentIndex,
    totalVideos,
    currentVideo,

    // Navigation
    hasNext,
    hasPrevious,
    goToNext,
    goToPrevious,

    // Loading state
    isLoading: playlistQuery.isLoading,
  };
}

