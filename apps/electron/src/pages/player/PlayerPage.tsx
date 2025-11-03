import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Rewind, FastForward } from "lucide-react";
import { useVideoPlayback } from "./hooks/useVideoPlayback";
import { useWatchProgress } from "./hooks/useWatchProgress";
import { useAnnotations } from "./hooks/useAnnotations";
import { usePlaylistNavigation } from "./hooks/usePlaylistNavigation";
import { VideoPlayer } from "./components/VideoPlayer";
import { DownloadStatus } from "./components/DownloadStatus";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { AnnotationForm } from "./components/AnnotationForm";
import { TranscriptSettingsDialog } from "./components/TranscriptSettingsDialog";
import { PlaylistNavigation } from "./components/PlaylistNavigation";
import { fontFamilyAtom, fontSizeAtom } from "@/context/transcriptSettings";
import { useRightSidebar } from "@/context/rightSidebar";
import { trpcClient } from "@/utils/trpc";
import { useToast } from "@/hooks/use-toast";
import { filterLanguagesByPreference, isInCooldown, setCooldown, clearCooldown } from "./utils/transcriptUtils";

export default function PlayerPage() {
  const search = useSearch({ from: "/player" });
  const videoId = search.videoId as string | undefined;
  const playlistId = search.playlistId as string | undefined;
  const playlistIndex = search.playlistIndex as number | undefined;

  // Video reference for playback control
  const videoRef = useRef<HTMLVideoElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Hooks
  const playback = useVideoPlayback(videoId);
  const { currentTime, handleTimeUpdate } = useWatchProgress(videoId, videoRef, playback.data?.lastPositionSeconds);
  const annotations = useAnnotations(videoId, videoRef);
  const playlistNav = usePlaylistNavigation({ playlistId, playlistIndex, videoId });

  // Right sidebar for annotations
  const { setContent, setAnnotationsData } = useRightSidebar();

  // Transcript settings - using Jotai atoms with localStorage persistence
  const [showTranscriptSettings, setShowTranscriptSettings] = useState(false);
  const [isTranscriptCollapsed, setIsTranscriptCollapsed] = useState(false);
  const [fontFamily] = useAtom(fontFamilyAtom);
  const [fontSize] = useAtom(fontSizeAtom);

  // Global scroll-to-seek indicator
  const [seekIndicator, setSeekIndicator] = useState<{ direction: 'forward' | 'backward'; amount: number } | null>(null);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const filePath = playback.data?.filePath || null;
  const videoTitle = playback.data?.title || playback.data?.videoId || "Video";

  // ============================================================================
  // TRANSCRIPT QUERIES AND MUTATIONS (previously in useTranscript hook)
  // ============================================================================

  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const hasAttemptedFetchRef = useRef(false);
  const attemptedDownloadRef = useRef<Set<string>>(new Set());

  // User preferences query
  const userPrefsQuery = useQuery({
    queryKey: ["user-preferences"],
    queryFn: async () => {
      return await trpcClient.preferences.getUserPreferences.query();
    },
  });

  // Fetch video info mutation (when subtitle data is missing)
  const fetchVideoInfoMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing videoId");
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      return await trpcClient.ytdlp.fetchVideoInfo.mutate({ url });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-playback", videoId] });
      queryClient.invalidateQueries({ queryKey: ["available-subs", videoId] });
    },
  });

  // Auto-fetch video info when subtitle data is missing
  useEffect(() => {
    if (!videoId) return;
    if (playback.data === undefined) return; // Still loading

    if (
      playback.data !== null &&
      !('availableLanguages' in playback.data) &&
      !fetchVideoInfoMutation.isPending &&
      !fetchVideoInfoMutation.isSuccess &&
      !hasAttemptedFetchRef.current
    ) {
      hasAttemptedFetchRef.current = true;
      fetchVideoInfoMutation.mutate();
    }
  }, [videoId, playback.data, fetchVideoInfoMutation]);

  // Reset attempt flag when videoId changes
  useEffect(() => {
    hasAttemptedFetchRef.current = false;
  }, [videoId]);

  // Available subtitles query
  const availableSubsQuery = useQuery({
    queryKey: ["available-subs", videoId],
    queryFn: async () => {
      if (!videoId) return { languages: [] as Array<{ lang: string; hasManual: boolean; hasAuto: boolean }> };

      if (playback.data && 'availableLanguages' in playback.data) {
        return { languages: playback.data.availableLanguages || [] };
      }

      return { languages: [] };
    },
    enabled: !!videoId && playback.data !== undefined,
    initialData: playback.data?.availableLanguages !== undefined
      ? { languages: playback.data.availableLanguages || [] }
      : undefined,
  });

  // Filter languages by user preferences
  const filteredLanguages = useMemo(
    () => filterLanguagesByPreference(
      availableSubsQuery.data?.languages || [],
      userPrefsQuery.data?.preferredLanguages || []
    ),
    [availableSubsQuery.data, userPrefsQuery.data]
  );

  // Validate selected language is available
  useEffect(() => {
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

  // Transcript query
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

  const transcriptData = transcriptQuery.data as any;
  const effectiveLang = selectedLang ?? (transcriptData?.language as string | undefined);

  // Clear download attempt when transcript loads
  useEffect(() => {
    if (transcriptData) {
      const key = `${videoId}|${selectedLang ?? "__default__"}`;
      attemptedDownloadRef.current.delete(key);
    }
  }, [videoId, selectedLang, transcriptData]);

  // Transcript segments query
  const transcriptSegmentsQuery = useQuery({
    queryKey: ["transcript-segments", videoId, effectiveLang ?? "__default__"],
    queryFn: async () => {
      if (!videoId) return { segments: [] as Array<{ start: number; end: number; text: string }> };
      return await trpcClient.ytdlp.getTranscriptSegments.query({
        videoId,
        lang: effectiveLang
      });
    },
    enabled: !!videoId,
    placeholderData: (prev) => prev as any,
  });

  // Download transcript mutation
  const downloadTranscriptMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing videoId");
      return await trpcClient.ytdlp.downloadTranscript.mutate({
        videoId,
        lang: selectedLang ?? undefined
      });
    },
    onSuccess: (res: any) => {
      if (!videoId) return;

      if (res?.success) {
        queryClient.invalidateQueries({ queryKey: ["transcript", videoId, selectedLang ?? "__default__"] });
        queryClient.invalidateQueries({ queryKey: ["transcript-segments", videoId] });
        clearCooldown(videoId, selectedLang);
        return;
      }

      // Handle rate limit
      if (res?.code === "RATE_LIMITED") {
        const retryAfterMs: number = res.retryAfterMs ?? 15 * 60 * 1000;
        setCooldown(videoId, selectedLang, retryAfterMs);
        toast({
          title: "Rate limited by YouTube",
          description: `Too many requests. Try again in about ${Math.ceil(retryAfterMs / 60000)} min`,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Transcript download failed",
        description: String(res?.message ?? "Unknown error"),
        variant: "destructive",
      });
    },
  });

  // Auto-download transcript when file becomes available
  useEffect(() => {
    if (!videoId || !filePath) return;
    if (downloadTranscriptMutation.isPending) return;
    if (transcriptQuery.isFetching || transcriptQuery.isLoading) return;
    if (transcriptData) return; // Already have transcript

    const key = `${videoId}|${selectedLang ?? "__default__"}`;
    if (attemptedDownloadRef.current.has(key)) return;

    const cooldownCheck = isInCooldown(videoId, selectedLang);
    if (cooldownCheck.inCooldown) return;

    // Only auto-download if query finished and returned null
    if (transcriptQuery.isSuccess && transcriptData === null) {
      attemptedDownloadRef.current.add(key);
      downloadTranscriptMutation.mutate();
    }
  }, [
    videoId,
    filePath,
    transcriptData,
    transcriptQuery.isFetching,
    transcriptQuery.isLoading,
    transcriptQuery.isSuccess,
    selectedLang,
    downloadTranscriptMutation,
  ]);

  // Set sidebar to show annotations when on PlayerPage
  useEffect(() => {
    setContent("annotations");
    setAnnotationsData({
      annotationsQuery: annotations.annotationsQuery,
      onSeek: annotations.handleSeekToAnnotation,
      onDelete: annotations.deleteAnnotationMutation.mutate,
      videoTitle: playback.data?.title,
      videoDescription: playback.data?.description,
      currentTime: currentTime, // Pass current time for auto-scrolling
    });

    // Reset to queue when leaving PlayerPage
    return () => {
      setContent("queue");
      setAnnotationsData(null);
    };
  }, [
    setContent,
    setAnnotationsData,
    annotations.annotationsQuery,
    annotations.handleSeekToAnnotation,
    annotations.deleteAnnotationMutation.mutate,
    playback.data?.title,
    playback.data?.description,
    currentTime, // Update when current time changes
  ]);

  // Auto-pause video when annotation dialog opens, resume when it closes
  const wasPlayingRef = useRef<boolean>(false);
  const pauseForDialog = useCallback((isOpen: boolean) => {
    if (!videoRef.current) return;

    if (isOpen) {
      // Dialog is opening - pause video if it's playing
      if (!wasPlayingRef.current) {
        wasPlayingRef.current = !videoRef.current.paused;
      }
      if (wasPlayingRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    } else {
      // Dialog is closing - resume if it was playing before
      if (!annotations.showAnnotationForm) {
        if (wasPlayingRef.current && videoRef.current.paused) {
          videoRef.current.play().catch(() => {
            // Ignore play() errors (e.g., if video was removed)
          });
        }
        wasPlayingRef.current = false;
      }
    }
  }, [annotations.showAnnotationForm]);

  useEffect(() => {
    pauseForDialog(annotations.showAnnotationForm);
  }, [annotations.showAnnotationForm, pauseForDialog]);


  // Handle annotation form Enter key (for keyboard navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (annotations.showAnnotationForm && e.key === "Enter" && e.ctrlKey) {
        annotations.createAnnotationMutation.mutate(currentTime);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotations.showAnnotationForm, annotations.annotationNote, annotations.createAnnotationMutation, currentTime]);

  // Global scroll-to-seek (works anywhere on the page when video is playing)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !filePath) return; // Only active when video is loaded

    const handleWheel = (e: WheelEvent) => {
      // Prevent default scrolling
      e.preventDefault();

      // Determine seek direction and amount
      const seekAmount = 5; // seconds per scroll tick
      const direction = e.deltaY < 0 ? 'backward' : 'forward';
      const delta = direction === 'forward' ? seekAmount : -seekAmount;

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
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, [filePath]); // Re-run when file path changes (video loads)

  return (
    <div className="container mx-auto space-y-6 p-6 relative">
      {/* Global Seek Indicator Overlay */}
      {seekIndicator && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-black/80 backdrop-blur-sm rounded-lg px-6 py-4 flex items-center gap-3 shadow-lg animate-in fade-in zoom-in-95 duration-200">
            {seekIndicator.direction === 'backward' ? (
              <>
                <Rewind className="w-8 h-8 text-white" />
                <div className="text-white">
                  <p className="text-2xl font-bold">-{seekIndicator.amount}s</p>
                  <p className="text-xs text-white/70">Backward</p>
                </div>
              </>
            ) : (
              <>
                <div className="text-white text-right">
                  <p className="text-2xl font-bold">+{seekIndicator.amount}s</p>
                  <p className="text-xs text-white/70">Forward</p>
                </div>
                <FastForward className="w-8 h-8 text-white" />
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
          {playback.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !videoId ? (
            <Alert>
              <AlertTitle>Missing video</AlertTitle>
              <AlertDescription>No video id provided.</AlertDescription>
            </Alert>
          ) : !playback.data ? (
            <Alert>
              <AlertTitle>Not found</AlertTitle>
              <AlertDescription>Could not find that video.</AlertDescription>
            </Alert>
          ) : !filePath ? (
            <DownloadStatus
              videoId={videoId}
              status={playback.data?.status as string | undefined}
              progress={playback.data?.progress ?? null}
              onStartDownload={() => playback.startDownloadMutation.mutate()}
              isStarting={playback.startDownloadMutation.isPending}
            />
          ) : (
            <div className="space-y-4">
              <VideoPlayer
                filePath={filePath}
                videoRef={videoRef}
                onTimeUpdate={handleTimeUpdate}
              />

              {/* Transcript - Full Width (Annotations moved to right sidebar) */}
              <TranscriptPanel
                videoId={videoId}
                currentTime={currentTime}
                videoRef={videoRef}
                transcriptQuery={transcriptQuery}
                transcriptSegmentsQuery={transcriptSegmentsQuery}
                downloadTranscriptMutation={downloadTranscriptMutation}
                availableSubsQuery={availableSubsQuery}
                filteredLanguages={filteredLanguages}
                selectedLang={selectedLang}
                setSelectedLang={setSelectedLang}
                fontFamily={fontFamily}
                fontSize={fontSize}
                onSettingsClick={() => setShowTranscriptSettings(true)}
                onSelect={annotations.handleTranscriptSelect}
                onEnterKey={() => annotations.setShowAnnotationForm(true)}
                isCollapsed={isTranscriptCollapsed}
                onToggleCollapse={() => setIsTranscriptCollapsed(!isTranscriptCollapsed)}
              />

              {/* Playlist Navigation - Show when playing from a playlist */}
              {playlistNav.isPlaylist && (
                <PlaylistNavigation
                  playlistTitle={playlistNav.playlistTitle}
                  currentIndex={playlistNav.currentIndex}
                  totalVideos={playlistNav.totalVideos}
                  hasNext={playlistNav.hasNext}
                  hasPrevious={playlistNav.hasPrevious}
                  onNext={playlistNav.goToNext}
                  onPrevious={playlistNav.goToPrevious}
                />
              )}

              {/* Annotation Form Dialog */}
              <AnnotationForm
                open={annotations.showAnnotationForm}
                currentTime={currentTime}
                selectedText={annotations.selectedText}
                language={effectiveLang}
                videoId={videoId}
                note={annotations.annotationNote}
                emoji={annotations.selectedEmoji}
                onNoteChange={annotations.setAnnotationNote}
                onEmojiChange={annotations.setSelectedEmoji}
                onSave={() => annotations.createAnnotationMutation.mutate(currentTime)}
                onCancel={() => {
                  annotations.setShowAnnotationForm(false);
                  annotations.setAnnotationNote("");
                  annotations.setSelectedText("");
                  annotations.setSelectedEmoji(null);
                }}
                isSaving={annotations.createAnnotationMutation.isPending}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transcript Settings Dialog */}
      <TranscriptSettingsDialog
        open={showTranscriptSettings}
        onOpenChange={setShowTranscriptSettings}
        filteredLanguages={filteredLanguages}
        selectedLang={selectedLang}
        effectiveLang={effectiveLang}
        onLanguageChange={setSelectedLang}
      />

    </div>
  );
}
