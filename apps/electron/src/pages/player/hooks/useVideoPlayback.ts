import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";

export function useVideoPlayback(videoId: string | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
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
  const autoStartedRef = React.useRef(false);
  React.useEffect(() => {
    if (!videoId) return;
    if (data?.filePath) return; // We already have the file

    const st = (data?.status as string | undefined) || undefined;
    const isActive = st && ["downloading", "queued", "paused"].includes(st);

    if (!isActive && !autoStartedRef.current) {
      autoStartedRef.current = true;
      startDownloadMutation.mutate();
    }
  }, [videoId, data?.filePath, data?.status, startDownloadMutation]);

  // When status flips to completed but filePath not yet populated, force a refresh once
  const completionRefetchRef = React.useRef(false);
  React.useEffect(() => {
    if (!videoId) return;
    if (data?.filePath) return;
    if ((data?.status as string | undefined) === "completed" && !completionRefetchRef.current) {
      completionRefetchRef.current = true;
      queryClient.invalidateQueries({ queryKey: ["video-playback", videoId] });
    }
  }, [data?.status, data?.filePath, videoId, queryClient]);

  return {
    data,
    isLoading,
    startDownloadMutation,
  };
}
