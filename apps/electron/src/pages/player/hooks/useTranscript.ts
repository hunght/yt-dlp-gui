import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { useToast } from "@/hooks/use-toast";

export function useTranscript(videoId: string | undefined, videoPlaybackData?: any) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // User's preferred languages
  const userPrefsQuery = useQuery({
    queryKey: ["user-preferences"],
    queryFn: async () => {
      return await trpcClient.preferences.getUserPreferences.query();
    },
  });

  // Mutation to fetch video info when subtitle data is missing
  const fetchVideoInfoMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing videoId");
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      return await trpcClient.ytdlp.fetchVideoInfo.mutate({ url });
    },
    onSuccess: () => {
      // Invalidate video playback query to refetch with new subtitle data
      queryClient.invalidateQueries({ queryKey: ["video-playback", videoId] });
      // Also invalidate available subs query
      queryClient.invalidateQueries({ queryKey: ["available-subs", videoId] });
    },
  });

  // Auto-fetch video info when subtitle data is missing
  const hasAttemptedFetchRef = React.useRef(false);
  React.useEffect(() => {
    if (!videoId) return;
    if (videoPlaybackData === undefined) return; // Still loading

    // If video exists but subtitle info is missing, fetch it
    if (
      videoPlaybackData !== null &&
      !('availableLanguages' in videoPlaybackData) &&
      !fetchVideoInfoMutation.isPending &&
      !fetchVideoInfoMutation.isSuccess &&
      !hasAttemptedFetchRef.current
    ) {
      hasAttemptedFetchRef.current = true;
      fetchVideoInfoMutation.mutate();
    }
  }, [videoId, videoPlaybackData, fetchVideoInfoMutation.isPending, fetchVideoInfoMutation.isSuccess, fetchVideoInfoMutation.mutate]);

  // Reset attempt flag when videoId changes
  React.useEffect(() => {
    hasAttemptedFetchRef.current = false;
  }, [videoId]);

  // Available subtitles - use from videoPlaybackData if available (from DB cache)
  const availableSubsQuery = useQuery({
    queryKey: ["available-subs", videoId],
    queryFn: async () => {
      if (!videoId) return { languages: [] } as { languages: Array<{ lang: string; hasManual: boolean; hasAuto: boolean }> };

      // First try to get from videoPlaybackData (from DB cache, no yt-dlp call needed)
      // Note: videoPlaybackData?.availableLanguages can be [] (empty array) if no subtitles, so we check if property exists
      if (videoPlaybackData && 'availableLanguages' in videoPlaybackData) {
        // Data is loaded, use it (even if empty array - means no subtitles available)
        return { languages: videoPlaybackData.availableLanguages || [] };
      }

      // Return empty for now - will be populated after fetchVideoInfo completes (triggered by useEffect above)
      return { languages: [] };
    },
    enabled: !!videoId && videoPlaybackData !== undefined, // Wait for videoPlaybackData to load (or be null)
    // Use cached data immediately if available from videoPlaybackData
    initialData: videoPlaybackData?.availableLanguages !== undefined
      ? { languages: videoPlaybackData.availableLanguages || [] }
      : undefined,
  });

  // Filter available subtitles to only show user's preferred languages
  const filteredLanguages = React.useMemo(() => {
    const available = availableSubsQuery.data?.languages || [];
    const preferred = userPrefsQuery.data?.preferredLanguages || [];
    if (preferred.length === 0) return available; // Show all if no preferences
    return available.filter((l: any) => preferred.includes(l.lang));
  }, [availableSubsQuery.data, userPrefsQuery.data]);

  // Selected language for transcript (null => use default stored transcript)
  const [selectedLang, setSelectedLang] = React.useState<string | null>(null);

  // If selected language isn't available for this video, reset and notify
  React.useEffect(() => {
    const available = (availableSubsQuery.data?.languages || []).map((l: any) => l.lang);
    if (selectedLang && !available.includes(selectedLang)) {
      toast({
        title: "Subtitle not available",
        description: `No transcript available in ${selectedLang.toUpperCase()} for this video. Showing default transcript instead.`,
        variant: "destructive",
      });
      setSelectedLang(null);
    }
  }, [availableSubsQuery.data, selectedLang, toast]);

  // Transcript for selected language (or default if none selected)
  const transcriptQuery = useQuery({
    queryKey: ["transcript", videoId, selectedLang ?? "__default__"],
    queryFn: async () => {
      if (!videoId) return null;
      if (selectedLang) {
        return await trpcClient.ytdlp.getTranscript.query({ videoId, lang: selectedLang });
      }
      return await trpcClient.ytdlp.getTranscript.query({ videoId });
    },
    enabled: !!videoId,
    placeholderData: (prev) => prev as any,
  });

  // Clear attempt ref when transcript is successfully loaded (to allow retry if needed later)
  React.useEffect(() => {
    if (transcriptQuery.data) {
      const key = `${videoId}|${selectedLang ?? "__default__"}`;
      attemptedRef.current.delete(key);
    }
  }, [videoId, selectedLang, transcriptQuery.data]);

  // Transcript segments (timestamped) for highlighting
  const effectiveLang = React.useMemo(() => {
    return selectedLang ?? ((transcriptQuery.data as any)?.language as string | undefined);
  }, [selectedLang, transcriptQuery.data]);

  const transcriptSegmentsQuery = useQuery({
    queryKey: [
      "transcript-segments",
      videoId,
      effectiveLang ?? "__default__",
    ],
    queryFn: async () => {
      if (!videoId) return { segments: [] as Array<{ start: number; end: number; text: string }> };
      const lang = effectiveLang;
      return await trpcClient.ytdlp.getTranscriptSegments.query({ videoId, lang });
    },
    enabled: !!videoId,
    placeholderData: (prev) => prev as any,
  });

  // Auto-download transcript on mount if not present and file exists
  const downloadTranscriptMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing videoId");
      return await trpcClient.ytdlp.downloadTranscript.mutate({ videoId, lang: selectedLang ?? undefined });
    },
    onSuccess: (res: any) => {
      if (res?.success) {
        queryClient.invalidateQueries({ queryKey: ["transcript", videoId, selectedLang ?? "__default__"] });
        queryClient.invalidateQueries({ queryKey: ["transcript-segments", videoId] });
        // Clear cooldown for this key on success
        try {
          const key = `${videoId}|${selectedLang ?? "__default__"}`;
          const raw = localStorage.getItem("transcript-download-cooldowns");
          const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
          if (map[key]) {
            delete map[key];
            localStorage.setItem("transcript-download-cooldowns", JSON.stringify(map));
          }
        } catch {}
        return;
      }
      // Handle rate limit structured error
      if (res?.code === "RATE_LIMITED") {
        const retryAfterMs: number = res.retryAfterMs ?? 15 * 60 * 1000;
        const until = Date.now() + retryAfterMs;
        try {
          const key = `${videoId}|${selectedLang ?? "__default__"}`;
          const raw = localStorage.getItem("transcript-download-cooldowns");
          const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
          map[key] = until;
          localStorage.setItem("transcript-download-cooldowns", JSON.stringify(map));
        } catch {}
        toast({
          title: "Rate limited by YouTube",
          description: `Too many requests. We'll pause transcript downloads for this language. Try again in about ${Math.ceil(retryAfterMs / 60000)} min`,
          variant: "destructive",
        });
        return;
      }
      // Generic failure
      toast({
        title: "Transcript download failed",
        description: String(res?.message ?? "Unknown error"),
        variant: "destructive",
      });
    },
  });

  // This will be handled by the parent component that has access to filePath
  // We'll provide a function to trigger auto-download
  const attemptedRef = React.useRef<Set<string>>(new Set());
  const attemptAutoDownload = React.useCallback((filePath: string | null | undefined) => {
    if (!videoId) return;
    if (!filePath) return; // File not downloaded yet
    if (downloadTranscriptMutation.isPending) return;

    // Don't attempt if query is still loading - wait for it to finish first
    if (transcriptQuery.isFetching || transcriptQuery.isLoading) return;

    // If we have transcript data, don't download again
    if (transcriptQuery.data) return;

    // If query has been successfully fetched but returned null, that means transcript doesn't exist
    // But we should still check if we've already attempted to download it
    const key = `${videoId}|${selectedLang ?? "__default__"}`;
    if (attemptedRef.current.has(key)) return;

    try {
      const raw = localStorage.getItem("transcript-download-cooldowns");
      const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      const until = map[key];
      if (until && Date.now() < until) {
        // In cooldown window; do not auto-download
        return;
      }
    } catch {}

    // Auto-download transcript only if query has finished and returned null (transcript doesn't exist)
    if (transcriptQuery.isSuccess && transcriptQuery.data === null) {
      attemptedRef.current.add(key);
      downloadTranscriptMutation.mutate();
    }
  }, [videoId, transcriptQuery.data, transcriptQuery.isFetching, transcriptQuery.isLoading, transcriptQuery.isSuccess, selectedLang, downloadTranscriptMutation]);

  return {
    filteredLanguages,
    selectedLang,
    setSelectedLang,
    transcriptQuery,
    transcriptSegmentsQuery,
    downloadTranscriptMutation,
    availableSubsQuery,
    attemptAutoDownload,
  };
}
