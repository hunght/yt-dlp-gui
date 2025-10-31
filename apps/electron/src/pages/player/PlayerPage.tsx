import React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { X, Clock, FileText } from "lucide-react";

interface Annotation {
  id: string;
  videoId: string;
  timestampSeconds: number;
  selectedText?: string | null;
  note: string;
  createdAt: number;
  updatedAt?: number | null;
}

export default function PlayerPage() {
  const navigate = useNavigate();
  // Use TanStack Router's useSearch instead of window.location.search
  const search = useSearch({ from: "/player" });
  const videoId = search.videoId as string | undefined;
  const queryClient = useQueryClient();

  // Video reference for playback control and current time tracking
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = React.useState(0);

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

  // Transcript
  const transcriptQuery = useQuery({
    queryKey: ["transcript", videoId],
    queryFn: async () => {
      if (!videoId) return null;
      return await trpcClient.ytdlp.getTranscript.query({ videoId });
    },
    enabled: !!videoId,
  });

  // Annotations for this video
  const annotationsQuery = useQuery({
    queryKey: ["annotations", videoId],
    queryFn: async () => {
      if (!videoId) return [];
      return await trpcClient.ytdlp.getAnnotations.query({ videoId });
    },
    enabled: !!videoId,
  });

  // Auto-download transcript on mount if not present and file exists
  const downloadTranscriptMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing videoId");
      return await trpcClient.ytdlp.downloadTranscript.mutate({ videoId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transcript", videoId] });
    },
  });

  React.useEffect(() => {
    if (!videoId) return;
    if (transcriptQuery.data) return; // Already have transcript
    if (!data?.filePath) return; // File not downloaded yet
    if (downloadTranscriptMutation.isPending) return;

    // Auto-download transcript
    downloadTranscriptMutation.mutate();
  }, [videoId, data?.filePath, transcriptQuery.data, downloadTranscriptMutation]);

  // Handle text selection in transcript for annotations
  const [selectedText, setSelectedText] = React.useState("");
  const [annotationNote, setAnnotationNote] = React.useState("");
  const [showAnnotationForm, setShowAnnotationForm] = React.useState(false);

  const handleTranscriptSelect = () => {
    const selection = window.getSelection()?.toString() || "";
    if (selection.length > 0) {
      setSelectedText(selection);
      setShowAnnotationForm(true);
    }
  };

  const createAnnotationMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing videoId");
      return await trpcClient.ytdlp.createAnnotation.mutate({
        videoId,
        timestampSeconds: currentTime,
        selectedText: selectedText || undefined,
        note: annotationNote,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", videoId] });
      setAnnotationNote("");
      setSelectedText("");
      setShowAnnotationForm(false);
    },
  });

  const deleteAnnotationMutation = useMutation({
    mutationFn: async (annotationId: string) => {
      return await trpcClient.ytdlp.deleteAnnotation.mutate({ id: annotationId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", videoId] });
    },
  });

  const handleSeekToAnnotation = (timestampSeconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestampSeconds;
      videoRef.current.play();
    }
  };

  const filePath = data?.filePath || null;
  const toLocalFileUrl = (p: string) => `local-file://${p}`;
  const videoTitle = data?.title || data?.videoId || "Video";

  // Accumulate watch time and persist to DB periodically
  const lastTimeRef = React.useRef<number>(0);
  const accumulatedRef = React.useRef<number>(0);
  const flushTimerRef = React.useRef<any>(null);

  const handleTimeUpdate = React.useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      const el = e.currentTarget;
      const current = el.currentTime;
      setCurrentTime(current);
      const prev = lastTimeRef.current;
      if (current > prev) {
        accumulatedRef.current += current - prev;
      }
      lastTimeRef.current = current;
    },
    []
  );

  const flushProgress = React.useCallback(async () => {
    if (!data?.videoId) return;
    const delta = Math.floor(accumulatedRef.current);
    if (delta <= 0) return;
    accumulatedRef.current = 0;
    try {
      await trpcClient.ytdlp.recordWatchProgress.mutate({
        videoId: data.videoId,
        deltaSeconds: delta,
        positionSeconds: Math.floor(lastTimeRef.current || 0),
      });
    } catch {}
  }, [data?.videoId]);

  React.useEffect(() => {
    // Flush every 10 seconds
    flushTimerRef.current = setInterval(() => {
      flushProgress();
    }, 10000);
    return () => {
      clearInterval(flushTimerRef.current);
      flushProgress();
    };
  }, [flushProgress]);

  // Start download via Queue Router (same pattern as Dashboard)
  const startDownloadMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing videoId");
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      return await trpcClient.queue.addToQueue.mutate({ urls: [url] });
    },
    onSuccess: () => {
      // Trigger immediate refetch to show status/progress
      queryClient.invalidateQueries({ queryKey: ["video-playback", videoId] });
    },
  });

  const statusText = (status?: string | null, progress?: number | null) => {
    if (!status) return null;
    switch (status) {
      case "completed":
        return "Downloaded";
      case "downloading":
        return `Downloading ${progress ?? 0}%`;
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

  // Auto-start download once if file is missing and not already downloading
  const autoStartedRef = React.useRef(false);
  React.useEffect(() => {
    if (!videoId) return;
    if (filePath) return; // We already have the file

    const st = (data?.status as string | undefined) || undefined;
    const isActive = st && ["downloading", "queued", "paused"].includes(st);

    if (!isActive && !autoStartedRef.current) {
      autoStartedRef.current = true;
      startDownloadMutation.mutate();
    }
  }, [videoId, filePath, data?.status, startDownloadMutation]);

  // When status flips to completed but filePath not yet populated, force a refresh once
  const completionRefetchRef = React.useRef(false);
  React.useEffect(() => {
    if (!videoId) return;
    if (filePath) return;
    if ((data?.status as string | undefined) === "completed" && !completionRefetchRef.current) {
      completionRefetchRef.current = true;
      queryClient.invalidateQueries({ queryKey: ["video-playback", videoId] });
    }
  }, [data?.status, filePath, videoId, queryClient]);

  // Format transcript text into paragraphs for better readability
  const formatTranscript = React.useCallback((text: string | null | undefined): string[] => {
    if (!text) return [];
    // Split by double newlines, periods followed by spaces, or newlines
    // Then group into meaningful paragraphs
    return text
      .split(/\n\n+/)
      .map((para) => para.trim())
      .filter((para) => para.length > 0)
      .map((para) => {
        // If paragraph is too long, try to split by sentences
        if (para.length > 300) {
          return para
            .replace(/([.!?])\s+/g, "$1\n")
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        }
        return [para];
      })
      .flat();
  }, []);

  const transcriptParagraphs = React.useMemo(() => {
    return formatTranscript(transcriptQuery.data?.text);
  }, [transcriptQuery.data?.text, formatTranscript]);

  return (
    <div className="container mx-auto space-y-6 p-6">

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{videoTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !videoId ? (
            <Alert>
              <AlertTitle>Missing video</AlertTitle>
              <AlertDescription>No video id provided.</AlertDescription>
            </Alert>
          ) : !data ? (
            <Alert>
              <AlertTitle>Not found</AlertTitle>
              <AlertDescription>Could not find that video.</AlertDescription>
            </Alert>
          ) : !filePath ? (
            <div className="space-y-3">
              <Alert>
                <AlertTitle>File not available</AlertTitle>
                <AlertDescription>
                  The video has no downloaded file yet. {data?.status ? "Current status shown below." : "Start a download to fetch it."}
                </AlertDescription>
              </Alert>

              {/* Show progress if any */}
              {data?.status && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status: {data.status}</span>
                    <span className="font-medium">{data.progress ?? 0}%</span>
                  </div>
                  <Progress
                    value={data.progress ?? 0}
                    className="h-2"
                    indicatorClassName={
                      data.status === "completed"
                        ? "bg-green-500"
                        : data.status === "failed"
                        ? "bg-red-500"
                        : "bg-blue-500"
                    }
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => startDownloadMutation.mutate()}
                  disabled={startDownloadMutation.isPending || ["downloading", "queued"].includes((data?.status as any) || "")}
                >
                  {startDownloadMutation.isPending
                    ? "Starting..."
                    : ["downloading", "queued"].includes((data?.status as any) || "")
                    ? statusText(data?.status, data?.progress)
                    : "Download video"}
                </Button>
                {videoId && (
                  <Button
                    variant="outline"
                    onClick={() => trpcClient.utils.openExternalUrl.mutate({ url: `https://www.youtube.com/watch?v=${videoId}` })}
                  >
                    Open on YouTube
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <video
                ref={videoRef}
                key={filePath}
                src={toLocalFileUrl(filePath)}
                autoPlay
                controls
                className="w-full max-h-[60vh] rounded border bg-black"
                onTimeUpdate={handleTimeUpdate}
              />
              <div className="flex gap-2">
                <a
                  href={toLocalFileUrl(filePath)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-sm"
                >
                  Open file
                </a>
              </div>

              {/* Transcript with Annotation UI */}
              {transcriptQuery.data && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Transcript Panel */}
                  <div className="lg:col-span-2 space-y-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <h3 className="font-semibold text-base">Transcript</h3>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {transcriptParagraphs.length} {transcriptParagraphs.length === 1 ? "paragraph" : "paragraphs"}
                      </span>
                    </div>
                    <div
                      className="relative p-6 rounded-lg border bg-gradient-to-br from-background to-muted/20 max-h-[500px] overflow-y-auto overflow-x-hidden shadow-sm"
                      onMouseUp={handleTranscriptSelect}
                      style={{
                        scrollbarWidth: "thin",
                        scrollbarColor: "hsl(var(--muted)) transparent",
                      }}
                    >
                      {transcriptParagraphs.length > 0 ? (
                        <div className="space-y-4">
                          {transcriptParagraphs.map((paragraph, idx) => (
                            <p
                              key={idx}
                              className="text-sm leading-7 text-foreground/90 cursor-text select-text font-normal tracking-wide transition-colors hover:text-foreground"
                              style={{
                                fontFamily: "system-ui, -apple-system, sans-serif",
                              }}
                            >
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic text-center py-8">No transcript content available</p>
                      )}
                      <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background to-transparent pointer-events-none rounded-t-lg" />
                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none rounded-b-lg" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Select text to create annotations and notes
                    </p>
                  </div>

                  {/* Annotations Panel */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <h3 className="font-semibold text-base">
                        Notes
                        {annotationsQuery.data && annotationsQuery.data.length > 0 && (
                          <span className="ml-2 text-sm font-normal text-muted-foreground">
                            ({annotationsQuery.data.length})
                          </span>
                        )}
                      </h3>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto overflow-x-hidden space-y-2 border rounded-lg p-3 bg-gradient-to-br from-background to-muted/10 shadow-sm">
                      {annotationsQuery.data && annotationsQuery.data.length > 0 ? (
                        annotationsQuery.data.map((ann: Annotation) => (
                          <div
                            key={ann.id}
                            className="group p-3 bg-card border rounded-lg text-xs space-y-2 hover:bg-muted/40 hover:border-primary/20 cursor-pointer transition-all duration-200 hover:shadow-sm"
                            onClick={() => handleSeekToAnnotation(ann.timestampSeconds)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-muted-foreground group-hover:text-foreground transition-colors">
                                <Clock className="w-3.5 h-3.5" />
                                <span className="font-medium">
                                  {Math.floor(ann.timestampSeconds / 60)}:{String(Math.floor(ann.timestampSeconds % 60)).padStart(2, "0")}
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteAnnotationMutation.mutate(ann.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 rounded transition-opacity"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {ann.selectedText && (
                              <p className="italic text-muted-foreground text-xs leading-relaxed line-clamp-2 border-l-2 border-primary/30 pl-2 py-1">
                                "{ann.selectedText}"
                              </p>
                            )}
                            <p className="text-xs leading-relaxed line-clamp-4 text-foreground/90">{ann.note}</p>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-xs text-muted-foreground">No notes yet</p>
                          <p className="text-xs text-muted-foreground/70 mt-1">Select transcript text to create one</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Annotation Form */}
              {showAnnotationForm && (
                <div className="p-4 rounded-lg border bg-gradient-to-br from-muted/40 to-muted/20 shadow-md space-y-3 transition-all duration-200 animate-in fade-in-0 slide-in-from-bottom-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-semibold">
                        Add note at {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setShowAnnotationForm(false);
                        setAnnotationNote("");
                        setSelectedText("");
                      }}
                      className="p-1.5 hover:bg-muted rounded transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {selectedText && (
                    <div className="p-2.5 rounded bg-muted/50 border border-primary/20">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Selected text:</p>
                      <p className="text-xs italic text-foreground/90 leading-relaxed">"{selectedText}"</p>
                    </div>
                  )}
                  <Textarea
                    placeholder="Write your note..."
                    value={annotationNote}
                    onChange={(e) => setAnnotationNote(e.target.value)}
                    className="text-sm min-h-24 resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowAnnotationForm(false);
                        setAnnotationNote("");
                        setSelectedText("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => createAnnotationMutation.mutate()}
                      disabled={!annotationNote.trim() || createAnnotationMutation.isPending}
                    >
                      {createAnnotationMutation.isPending ? "Saving..." : "Save note"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
