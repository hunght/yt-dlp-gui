import React, { useRef, useState, useEffect, useCallback } from "react";
import { useSearch } from "@tanstack/react-router";
import { useAtom } from "jotai";
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
import { PlaylistNavigation } from "./components/PlaylistNavigation";
import { currentTranscriptLangAtom } from "@/context/transcriptSettings";
import { useRightSidebar } from "@/context/rightSidebar";

export default function PlayerPage() {
  const search = useSearch({ from: "/player" });
  const videoId = search.videoId as string | undefined;
  const playlistId = search.playlistId as string | undefined;
  const playlistIndex = search.playlistIndex as number | undefined;

  // Video reference for playback control
  const videoRef = useRef<HTMLVideoElement>(null);

  // Hooks
  const playback = useVideoPlayback(videoId);
  const { currentTime, handleTimeUpdate } = useWatchProgress(videoId, videoRef, playback.data?.lastPositionSeconds);
  const annotations = useAnnotations(videoId, videoRef);
  const playlistNav = usePlaylistNavigation({ playlistId, playlistIndex, videoId });

  // Right sidebar for annotations
  const { setContent, setAnnotationsData } = useRightSidebar();

  // Transcript collapsed state
  const [isTranscriptCollapsed, setIsTranscriptCollapsed] = useState(false);

  // Transcript language from atom (shared by TranscriptPanel)
  const [currentTranscriptLang] = useAtom(currentTranscriptLangAtom);

  // Global scroll-to-seek indicator
  const [seekIndicator, setSeekIndicator] = useState<{ direction: 'forward' | 'backward'; amount: number } | null>(null);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const filePath = playback.data?.filePath || null;
  const videoTitle = playback.data?.title || playback.data?.videoId || "Video";

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
                playbackData={playback.data}
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
                language={currentTranscriptLang}
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
    </div>
  );
}
