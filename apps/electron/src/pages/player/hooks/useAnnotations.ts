import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";

export interface Annotation {
  id: string;
  videoId: string;
  timestampSeconds: number;
  selectedText?: string | null;
  note: string;
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
    mutationFn: async (currentTime: number) => {
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

  return {
    annotationsQuery,
    selectedText,
    setSelectedText,
    annotationNote,
    setAnnotationNote,
    showAnnotationForm,
    setShowAnnotationForm,
    handleTranscriptSelect,
    createAnnotationMutation,
    deleteAnnotationMutation,
    handleSeekToAnnotation,
  };
}
