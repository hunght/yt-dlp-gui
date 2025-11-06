import React, { useMemo, useState, useEffect } from "react";
import { useAtom } from "jotai";
import { Clock, Languages, Loader2, BookmarkPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpcClient } from "@/utils/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { translationTargetLangAtom, includeTranslationInNoteAtom, currentTranscriptLangAtom } from "@/context/transcriptSettings";
import { toast } from "sonner";
import { openAnnotationFormAtom } from "@/context/annotations";

interface AnnotationFormProps {
  videoId: string;
  currentTime: number;
  videoRef: React.RefObject<HTMLVideoElement>;
}

// Emoji reaction types for quick note categorization
const EMOJI_REACTIONS = [
  { emoji: "❓", label: "Confused", description: "Mark as unclear or confusing" },
  { emoji: "💡", label: "Insight", description: "Important learning moment" },
  { emoji: "⭐", label: "Important", description: "Key point to remember" },
  { emoji: "🔖", label: "Bookmark", description: "Save for later review" },
] as const;

export function AnnotationForm({
  videoId,
  currentTime,
  videoRef,
}: AnnotationFormProps) {
  const queryClient = useQueryClient();

  // Atoms for settings and shared state
  const [translationTargetLang] = useAtom(translationTargetLangAtom);
  const [includeTranslationInNote] = useAtom(includeTranslationInNoteAtom);
  const [currentTranscriptLang] = useAtom(currentTranscriptLangAtom);
  const [openTrigger, setOpenTrigger] = useAtom(openAnnotationFormAtom);

  // Component owns ALL its state
  const [open, setOpen] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [note, setNote] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [wordSaved, setWordSaved] = useState(false);
  const [timestampWhenOpened, setTimestampWhenOpened] = useState(0);

  // Listen to open trigger from other components
  useEffect(() => {
    if (openTrigger && openTrigger.trigger > 0) {
      setOpen(true);
      setSelectedText(openTrigger.selectedText || "");
      setTimestampWhenOpened(openTrigger.currentTime || currentTime);
      // Clear the trigger
      setOpenTrigger(null);
    }
  }, [openTrigger, currentTime, setOpenTrigger]);

  // Create annotation mutation
  const createAnnotationMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing videoId");
        return await trpcClient.annotations.create.mutate({
        videoId,
        timestampSeconds: timestampWhenOpened,
        selectedText: selectedText || undefined,
        note,
        emoji: emoji || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", videoId] });
      // Reset form
      setNote("");
      setSelectedText("");
      setEmoji(null);
      setOpen(false);
      toast.success("Note saved!");
    },
    onError: (error) => {
      toast.error("Failed to save note: " + String(error));
    },
  });

  // Mutation for saving word to My Words
  const saveWordMutation = useMutation({
    mutationFn: async (translationId: string) => {
      return await trpcClient.translation.saveWord.mutate({ translationId });
    },
    onSuccess: (data) => {
      setWordSaved(true);
      toast.success(data.alreadySaved ? "Word already in My Words" : "Word saved to My Words! 📚");
      queryClient.invalidateQueries({ queryKey: ["saved-words"] });
    },
    onError: (error) => {
      toast.error("Failed to save word: " + String(error));
    },
  });

  // Auto-pause video when form opens
  useEffect(() => {
    if (!videoRef.current) return;

    if (open) {
      // Pause video when form opens
      if (!videoRef.current.paused) {
        videoRef.current.pause();
      }
    }
  }, [open, videoRef]);

  // Handle cancel
  const handleCancel = () => {
    setOpen(false);
    setNote("");
    setSelectedText("");
    setEmoji(null);
    setWordSaved(false);
  };

  // Handle save with translation auto-append
  const handleSave = () => {
    // If setting is enabled and translation is available, append it to the note
    if (includeTranslationInNote && translationQuery.data?.success) {
      const translation = translationQuery.data.translation;
      const currentNote = note.trim();

      // Only append if translation is not already in the note
      if (currentNote && !currentNote.includes(translation)) {
        setNote(`${currentNote}\n\n→ ${translation}`);
      } else if (!currentNote) {
        setNote(`→ ${translation}`);
      }
    }

    // Save after brief delay to ensure state is updated
    setTimeout(() => {
      createAnnotationMutation.mutate();
    }, 0);
  };

  // Handle emoji selection
  const handleEmojiClick = (newEmoji: string) => {
    setEmoji(emoji === newEmoji ? null : newEmoji);
  };

  // Determine source and target languages
  const sourceLang = useMemo(() => {
    if (!currentTranscriptLang) return undefined;
    // Extract language code (e.g., "en" from "en-US")
    return currentTranscriptLang.split("-")[0];
  }, [currentTranscriptLang]);

  const targetLang = translationTargetLang || "en"; // Use user preference or default to English

  // Reset wordSaved state when dialog closes or text changes
  useEffect(() => {
    if (!open) {
      setWordSaved(false);
    }
  }, [open]);

  useEffect(() => {
    setWordSaved(false);
  }, [selectedText]);

  // Auto-translate when text is selected and dialog opens
  const translationQuery = useQuery({
    queryKey: ["translate", selectedText, sourceLang, targetLang, videoId, timestampWhenOpened],
    queryFn: async () => {
      if (!selectedText) return null;
      return await trpcClient.utils.translateText.query({
        text: selectedText,
        sourceLang,
        targetLang,
        // Video context is required for all translations
        videoId,
        timestampSeconds: Math.floor(timestampWhenOpened),
        contextText: selectedText, // Use the selected text as context
      });
    },
    enabled: !!selectedText && !!videoId && open, // Require videoId to be present
    staleTime: Infinity, // Cache translation results
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Add note at {Math.floor(timestampWhenOpened / 60)}:{String(Math.floor(timestampWhenOpened % 60)).padStart(2, "0")}
          </DialogTitle>
          {selectedText && (
            <DialogDescription asChild>
              <div className="mt-2 p-3 rounded bg-muted/50 border border-primary/20">
                <p className="text-xs font-medium text-muted-foreground mb-1">Selected text:</p>
                <p className="text-sm italic text-foreground/90 leading-relaxed">"{selectedText}"</p>
              </div>
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Auto Translation - only show if there's selected text */}
          {selectedText && (
            <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500/5 to-blue-500/10 border border-blue-500/20">
              <div className="flex items-start gap-3">
                <Languages className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">
                      Translation ({targetLang.toUpperCase()})
                    </p>
                  </div>

                  <div className="space-y-2">
                    {translationQuery.isLoading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Translating...
                      </div>
                    )}

                    {translationQuery.data?.success && (
                      <>
                        <div className="p-2 rounded bg-background border text-sm">
                          <p className="font-medium text-foreground">
                            {translationQuery.data.translation}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {translationQuery.data.sourceLang} → {translationQuery.data.targetLang}
                          </p>
                        </div>

                        {/* Save to My Words Button */}
                        <div className="flex items-center gap-2">
                          {wordSaved ? (
                            <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-3 py-1.5 rounded border border-green-200 dark:border-green-800">
                              <Check className="w-3 h-3" />
                              <span>Saved to My Words</span>
                            </div>
                          ) : translationQuery.data.success && (translationQuery.data as any).translationId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (translationQuery.data?.success && (translationQuery.data as any).translationId) {
                                  saveWordMutation.mutate((translationQuery.data as any).translationId);
                                }
                              }}
                              disabled={saveWordMutation.isPending}
                              className="text-xs h-7"
                            >
                              {saveWordMutation.isPending ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <BookmarkPlus className="w-3 h-3 mr-1.5" />
                                  Save to My Words
                                </>
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </>
                    )}

                    {translationQuery.data && !translationQuery.data.success && (
                      <p className="text-xs text-destructive">
                        Translation failed. Please try again.
                      </p>
                    )}

                    {translationQuery.isError && (
                      <p className="text-xs text-destructive">
                        Unable to connect to translation service.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Emoji Reactions */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Quick categorize (optional)
            </label>
            <div className="flex gap-2">
              {EMOJI_REACTIONS.map((reaction) => (
                <Button
                  key={reaction.emoji}
                  type="button"
                  variant={emoji === reaction.emoji ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => handleEmojiClick(reaction.emoji)}
                  title={reaction.description}
                >
                  <span className="text-base">{reaction.emoji}</span>
                  <span className="text-xs">{reaction.label}</span>
                </Button>
              ))}
            </div>
          </div>

          <Textarea
            placeholder="Write your note... (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="text-sm min-h-24 resize-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !createAnnotationMutation.isPending) {
                e.preventDefault();
                handleSave();
              }
            }}
          />
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {emoji && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground sm:mr-auto">
              <span className="text-base">{emoji}</span>
              <span>Selected</span>
            </div>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={handleCancel} disabled={createAnnotationMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createAnnotationMutation.isPending}
            >
              {createAnnotationMutation.isPending ? "Saving..." : emoji ? `Save ${emoji}` : "Save note"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
