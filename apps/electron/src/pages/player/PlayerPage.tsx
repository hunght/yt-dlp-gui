import React from "react";
import { useSearch } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useVideoPlayback } from "./hooks/useVideoPlayback";
import { useWatchProgress } from "./hooks/useWatchProgress";
import { useTranscript } from "./hooks/useTranscript";
import { useAnnotations } from "./hooks/useAnnotations";
import { VideoPlayer } from "./components/VideoPlayer";
import { DownloadStatus } from "./components/DownloadStatus";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { AnnotationsPanel } from "./components/AnnotationsPanel";
import { AnnotationForm } from "./components/AnnotationForm";
import { TranscriptSettingsDialog } from "./components/TranscriptSettingsDialog";

export default function PlayerPage() {
  const search = useSearch({ from: "/player" });
  const videoId = search.videoId as string | undefined;

  // Video reference for playback control
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Hooks
  const playback = useVideoPlayback(videoId);
  const { currentTime, handleTimeUpdate } = useWatchProgress(videoId, videoRef);
  const transcript = useTranscript(videoId, playback.data);
  const annotations = useAnnotations(videoId, videoRef);

  // Transcript settings state
  const [showTranscriptSettings, setShowTranscriptSettings] = React.useState(false);
  const [fontFamily, setFontFamily] = React.useState<"system" | "serif" | "mono">("system");
  const [fontSize, setFontSize] = React.useState<number>(14);

  // Load/save transcript settings from localStorage
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("transcript-settings");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.fontFamily) setFontFamily(parsed.fontFamily);
        if (parsed.fontSize) setFontSize(parsed.fontSize);
      }
    } catch {}
  }, []);
  React.useEffect(() => {
    try {
      localStorage.setItem(
        "transcript-settings",
        JSON.stringify({ fontFamily, fontSize })
      );
    } catch {}
  }, [fontFamily, fontSize]);

  // Auto-download transcript when file becomes available
  React.useEffect(() => {
    if (playback.data?.filePath) {
      transcript.attemptAutoDownload(playback.data.filePath);
    }
  }, [playback.data?.filePath, transcript.attemptAutoDownload]);

  // Auto-pause video when annotation dialog opens, resume when it closes
  const wasPlayingRef = React.useRef<boolean>(false);
  React.useEffect(() => {
    if (!videoRef.current) return;

    if (annotations.showAnnotationForm) {
      // Dialog is opening - pause video if it's playing
      wasPlayingRef.current = !videoRef.current.paused;
      if (wasPlayingRef.current) {
        videoRef.current.pause();
      }
    } else {
      // Dialog is closing - resume if it was playing before
      if (wasPlayingRef.current && videoRef.current.paused) {
        videoRef.current.play().catch(() => {
          // Ignore play() errors (e.g., if video was removed)
        });
      }
      wasPlayingRef.current = false;
    }
  }, [annotations.showAnnotationForm]);

  // Handle annotation form Enter key (for keyboard navigation)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (annotations.showAnnotationForm && e.key === "Enter" && e.ctrlKey) {
        if (annotations.annotationNote.trim()) {
          annotations.createAnnotationMutation.mutate(currentTime);
        }
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

              {/* Transcript with Annotation UI */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

                <AnnotationsPanel
                  annotationsQuery={annotations.annotationsQuery}
                  onSeek={annotations.handleSeekToAnnotation}
                  onDelete={annotations.deleteAnnotationMutation.mutate}
                />
              </div>

              {/* Annotation Form Dialog */}
              <AnnotationForm
                open={annotations.showAnnotationForm}
                currentTime={currentTime}
                selectedText={annotations.selectedText}
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
        fontFamily={fontFamily}
        fontSize={fontSize}
        onFontFamilyChange={setFontFamily}
        onFontSizeChange={setFontSize}
        filteredLanguages={transcript.filteredLanguages}
        selectedLang={transcript.selectedLang}
        effectiveLang={effectiveLang}
        onLanguageChange={(lang) => transcript.setSelectedLang(lang)}
      />
    </div>
  );
}
