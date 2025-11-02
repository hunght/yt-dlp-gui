import React from "react";
import { useSearch } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useVideoPlayback } from "./hooks/useVideoPlayback";
import { useWatchProgress } from "./hooks/useWatchProgress";
import { useTranscript } from "./hooks/useTranscript";
import { useAnnotations } from "./hooks/useAnnotations";
import { VideoPlayer } from "./components/VideoPlayer";
import { DownloadStatus } from "./components/DownloadStatus";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { AnnotationForm } from "./components/AnnotationForm";
import { TranscriptSettingsDialog } from "./components/TranscriptSettingsDialog";
import { fontFamilyAtom, fontSizeAtom } from "@/context/transcriptSettings";
import { useRightSidebar } from "@/context/rightSidebar";

export default function PlayerPage() {
  const search = useSearch({ from: "/player" });
  const videoId = search.videoId as string | undefined;

  // Video reference for playback control
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Hooks
  const playback = useVideoPlayback(videoId);
  const { currentTime, handleTimeUpdate } = useWatchProgress(videoId, videoRef, playback.data?.lastPositionSeconds);
  const transcript = useTranscript(videoId, playback.data);
  const annotations = useAnnotations(videoId, videoRef);

  // Right sidebar for annotations
  const { setContent, setAnnotationsData } = useRightSidebar();

  // Transcript settings - using Jotai atoms with localStorage persistence
  const [showTranscriptSettings, setShowTranscriptSettings] = React.useState(false);
  const [fontFamily] = useAtom(fontFamilyAtom);
  const [fontSize] = useAtom(fontSizeAtom);

  // Auto-download transcript when file becomes available
  React.useEffect(() => {
    if (playback.data?.filePath) {
      transcript.attemptAutoDownload(playback.data.filePath);
    }
  }, [playback.data?.filePath, transcript.attemptAutoDownload]);

  // Set sidebar to show annotations when on PlayerPage
  React.useEffect(() => {
    setContent("annotations");
    setAnnotationsData({
      annotationsQuery: annotations.annotationsQuery,
      onSeek: annotations.handleSeekToAnnotation,
      onDelete: annotations.deleteAnnotationMutation.mutate,
      videoTitle: playback.data?.title,
      videoDescription: playback.data?.description,
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
  ]);

  // Auto-pause video when annotation dialog opens, resume when it closes
  const wasPlayingRef = React.useRef<boolean>(false);
  const pauseForDialog = React.useCallback((isOpen: boolean) => {
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

  React.useEffect(() => {
    pauseForDialog(annotations.showAnnotationForm);
  }, [annotations.showAnnotationForm, pauseForDialog]);


  // Handle annotation form Enter key (for keyboard navigation)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (annotations.showAnnotationForm && e.key === "Enter" && e.ctrlKey) {
        annotations.createAnnotationMutation.mutate(currentTime);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotations.showAnnotationForm, annotations.annotationNote, annotations.createAnnotationMutation, currentTime]);

  const filePath = playback.data?.filePath || null;
  const videoTitle = playback.data?.title || playback.data?.videoId || "Video";
  const transcriptData = transcript.transcriptQuery.data as any;
  const effectiveLang = transcript.selectedLang ?? (transcriptData?.language as string | undefined);

  return (
    <div className="container mx-auto space-y-6 p-6">
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
                transcript={transcript}
                fontFamily={fontFamily}
                fontSize={fontSize}
                onSettingsClick={() => setShowTranscriptSettings(true)}
                onSelect={annotations.handleTranscriptSelect}
                onEnterKey={() => annotations.setShowAnnotationForm(true)}
              />

              {/* Annotation Form Dialog */}
              <AnnotationForm
                open={annotations.showAnnotationForm}
                currentTime={currentTime}
                selectedText={annotations.selectedText}
                language={effectiveLang}
                videoId={videoId}
                note={annotations.annotationNote}
                onNoteChange={annotations.setAnnotationNote}
                onSave={() => annotations.createAnnotationMutation.mutate(currentTime)}
                onCancel={() => {
                  annotations.setShowAnnotationForm(false);
                  annotations.setAnnotationNote("");
                  annotations.setSelectedText("");
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
        filteredLanguages={transcript.filteredLanguages}
        selectedLang={transcript.selectedLang}
        effectiveLang={effectiveLang}
        onLanguageChange={(lang) => transcript.setSelectedLang(lang)}
      />

    </div>
  );
}
