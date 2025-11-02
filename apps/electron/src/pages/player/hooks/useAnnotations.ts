import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";

export interface Annotation {
  id: string;
  videoId: string;
  timestampSeconds: number;
  selectedText?: string | null;
  note: string;
  emoji?: string | null;
  createdAt: number;
  updatedAt?: number | null;
}

export function useAnnotations(videoId: string | undefined, videoRef: React.RefObject<HTMLVideoElement>) {
  const queryClient = useQueryClient();

  const annotationsQuery = useQuery({
    queryKey: ["annotations", videoId],
    queryFn: async () => {
      if (!videoId) return [];
      return await trpcClient.ytdlp.getAnnotations.query({ videoId });
    },
    enabled: !!videoId,
  });

  const [selectedText, setSelectedText] = useState("");
  const [annotationNote, setAnnotationNote] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);

  const handleTranscriptSelect = () => {
    const selection = window.getSelection()?.toString() || "";
    if (selection.length > 0) {
      // Clean the selection (remove punctuation, trim)
      const cleaned = selection.trim();
      if (cleaned.length > 0) {
        setSelectedText(cleaned);
        setShowAnnotationForm(true);
      }
    }
  };

  const createAnnotationMutation = useMutation({
    mutationFn: async (currentTime: number) => {
      if (!videoId) throw new Error("Missing videoId");
      return await trpcClient.ytdlp.createAnnotation.mutate({
        videoId,
        timestampSeconds: currentTime,
        selectedText: selectedText || undefined,
        note: annotationNote,
        emoji: selectedEmoji || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", videoId] });
      setAnnotationNote("");
      setSelectedText("");
      setSelectedEmoji(null);
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

  return {
    annotationsQuery,
    selectedText,
    setSelectedText,
    annotationNote,
    setAnnotationNote,
    selectedEmoji,
    setSelectedEmoji,
    showAnnotationForm,
    setShowAnnotationForm,
    handleTranscriptSelect,
    createAnnotationMutation,
    deleteAnnotationMutation,
    handleSeekToAnnotation,
  };
}
