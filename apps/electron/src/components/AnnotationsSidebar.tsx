import React, { useRef, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Clock } from "lucide-react";
import { trpcClient } from "@/utils/trpc";

interface Annotation {
  id: string;
  videoId: string;
  timestampSeconds: number;
  selectedText?: string | null;
  note: string;
  emoji?: string | null;
  createdAt: number;
}

interface AnnotationsSidebarProps {
  videoId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  videoTitle?: string;
  videoDescription?: string;
  currentTime?: number;
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function parseTimestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

function renderDescriptionWithTimestamps(
  description: string,
  onSeek: (seconds: number) => void
): React.ReactNode {
  // Regex to match timestamps like 00:00, 03:44, 01:14:43
  const timestampRegex = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = timestampRegex.exec(description)) !== null) {
    const timestamp = match[1];
    const matchIndex = match.index;

    // Add text before timestamp
    if (matchIndex > lastIndex) {
      parts.push(description.substring(lastIndex, matchIndex));
    }

    // Add clickable timestamp
    const seconds = parseTimestampToSeconds(timestamp);
    parts.push(
      <button
        key={`timestamp-${matchIndex}`}
        onClick={(e) => {
          e.preventDefault();
          onSeek(seconds);
        }}
        className="text-primary hover:text-primary/80 hover:underline font-medium cursor-pointer inline-flex items-center gap-0.5"
      >
        <Clock className="w-3 h-3 inline" />
        {timestamp}
      </button>
    );

    lastIndex = matchIndex + timestamp.length;
  }

  // Add remaining text
  if (lastIndex < description.length) {
    parts.push(description.substring(lastIndex));
  }

  return parts.length > 0 ? parts : description;
}

export function AnnotationsSidebar({
  videoId,
  videoRef,
  videoTitle,
  videoDescription,
  currentTime = 0,
}: AnnotationsSidebarProps) {
  const queryClient = useQueryClient();
  const annotationRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Own annotations query
  const annotationsQuery = useQuery({
    queryKey: ["annotations", videoId],
    queryFn: async () => {
      if (!videoId) return [];
      return await trpcClient.ytdlp.getAnnotations.query({ videoId });
    },
    enabled: !!videoId,
  });

  // Own delete mutation
  const deleteAnnotationMutation = useMutation({
    mutationFn: async (annotationId: string) => {
      return await trpcClient.ytdlp.deleteAnnotation.mutate({ id: annotationId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", videoId] });
    },
  });

  // Own seek handler
  const handleSeek = useCallback((timestampSeconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestampSeconds;
      videoRef.current.play();
    }
  }, [videoRef]);

  const annotations = annotationsQuery.data || [];

  // Find the currently active annotation (closest one before or at current time)
  const activeAnnotationId = useMemo(() => {
    if (!currentTime || annotations.length === 0) return null;

    // Find all annotations at or before current time
    const passedAnnotations = annotations.filter(
      (a) => a.timestampSeconds <= currentTime
    );

    if (passedAnnotations.length === 0) return null;

    // Return the closest one (highest timestamp that's still <= currentTime)
    const closest = passedAnnotations.reduce((prev, current) =>
      current.timestampSeconds > prev.timestampSeconds ? current : prev
    );

    return closest.id;
  }, [annotations, currentTime]);

  // Auto-scroll to active annotation
  useEffect(() => {
    if (!activeAnnotationId) return;

    const element = annotationRefs.current.get(activeAnnotationId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeAnnotationId]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Notes</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {annotations.length} {annotations.length === 1 ? "note" : "notes"}
        </p>
      </div>

      {/* Video Description */}
      {videoDescription && (
        <Card className="mb-4 shadow-sm">
          <CardContent className="p-3">
            <h3 className="text-sm font-semibold mb-2">Description</h3>
            <div className="text-xs text-muted-foreground max-h-[200px] overflow-y-auto">
              <div className="whitespace-pre-wrap break-words">
                {renderDescriptionWithTimestamps(videoDescription, handleSeek)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ScrollArea className="flex-1">
        {annotationsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading notes...</p>
        ) : annotations.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              No notes yet. Select text in the transcript to add notes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {annotations.map((annotation) => {
              const isActive = annotation.id === activeAnnotationId;
              return (
              <Card
                key={annotation.id}
                ref={(el) => {
                  if (el) {
                    annotationRefs.current.set(annotation.id, el);
                  } else {
                    annotationRefs.current.delete(annotation.id);
                  }
                }}
                className={`shadow-sm hover:shadow-md transition-all ${
                  isActive
                    ? 'ring-2 ring-primary shadow-lg scale-[1.02]'
                    : ''
                }`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {annotation.emoji && (
                        <span className="text-lg" title="Category">
                          {annotation.emoji}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSeek(annotation.timestampSeconds)}
                        className="h-auto p-1 flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                      >
                        <Clock className="w-3 h-3" />
                        {formatTimestamp(annotation.timestampSeconds)}
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAnnotationMutation.mutate(annotation.id)}
                      className="h-auto p-1 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>

                  {annotation.selectedText && (
                    <div className="bg-muted/50 p-2 rounded text-xs mb-2 italic border-l-2 border-primary/30">
                      "{annotation.selectedText}"
                    </div>
                  )}

                  <p className="text-sm whitespace-pre-wrap break-words">
                    {annotation.note}
                  </p>

                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(annotation.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </CardContent>
              </Card>
            );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

