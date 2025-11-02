import React, { useMemo } from "react";
import { useAtom } from "jotai";
import { Clock, Languages, Loader2 } from "lucide-react";
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
import { useQuery } from "@tanstack/react-query";
import { translationTargetLangAtom, includeTranslationInNoteAtom } from "@/context/transcriptSettings";
import { Link } from "@tanstack/react-router";

interface AnnotationFormProps {
  open: boolean;
  currentTime: number;
  selectedText: string;
  note: string;
  emoji: string | null;
  language?: string;
  videoId: string; // Required: Video ID for linking translation to context
  onNoteChange: (note: string) => void;
  onEmojiChange: (emoji: string | null) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

// Emoji reaction types for quick note categorization
const EMOJI_REACTIONS = [
  { emoji: "❓", label: "Confused", description: "Mark as unclear or confusing" },
  { emoji: "💡", label: "Insight", description: "Important learning moment" },
  { emoji: "⭐", label: "Important", description: "Key point to remember" },
  { emoji: "🔖", label: "Bookmark", description: "Save for later review" },
] as const;

export function AnnotationForm({
  open,
  currentTime,
  selectedText,
  note,
  emoji,
  language,
  videoId,
  onNoteChange,
  onEmojiChange,
  onSave,
  onCancel,
  isSaving,
}: AnnotationFormProps) {
  // Use atoms directly for translation settings
  const [translationTargetLang] = useAtom(translationTargetLangAtom);
  const [includeTranslationInNote] = useAtom(includeTranslationInNoteAtom);

  // Handle save with translation auto-append
  const handleSave = () => {
    // If setting is enabled and translation is available, append it to the note
    if (includeTranslationInNote && translationQuery.data?.success) {
      const translation = translationQuery.data.translation;
      const currentNote = note.trim();

      // Only append if translation is not already in the note
      if (currentNote && !currentNote.includes(translation)) {
        onNoteChange(`${currentNote}\n\n→ ${translation}`);
      } else if (!currentNote) {
        onNoteChange(`→ ${translation}`);
      }
    }

    // Call the original save handler
    // Use setTimeout to ensure note state is updated before saving
    setTimeout(() => {
      onSave();
    }, 0);
  };

  // Handle emoji selection
  const handleEmojiClick = (newEmoji: string) => {
    onEmojiChange(emoji === newEmoji ? null : newEmoji);
  };

  // Determine source and target languages
  const sourceLang = useMemo(() => {
    if (!language) return undefined;
    // Extract language code (e.g., "en" from "en-US")
    return language.split("-")[0];
  }, [language]);

  const targetLang = translationTargetLang || "en"; // Use user preference or default to English

  // Auto-translate when text is selected and dialog opens
  const translationQuery = useQuery({
    queryKey: ["translate", selectedText, sourceLang, targetLang, videoId, currentTime],
    queryFn: async () => {
      if (!selectedText) return null;
      return await trpcClient.utils.translateText.query({
        text: selectedText,
        sourceLang: sourceLang,
        targetLang: targetLang,
        // Video context is required for all translations
        videoId: videoId,
        timestampSeconds: currentTime,
        contextText: selectedText, // Use the selected text as context
      });
    },
    enabled: !!selectedText && !!videoId && open, // Require videoId to be present
    staleTime: Infinity, // Cache translation results
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Add note at {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}
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
                    {translationQuery.data?.success && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        <span>✓ Auto-saved to </span>
                        <Link
                          to="/my-words"
                          className="font-semibold underline hover:text-blue-700 dark:hover:text-blue-300"
                        >
                          My Words
                        </Link>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    {translationQuery.isLoading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Translating...
                      </div>
                    )}

                    {translationQuery.data?.success && (
                      <div className="p-2 rounded bg-background border text-sm">
                        <p className="font-medium text-foreground">
                          {translationQuery.data.translation}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {translationQuery.data.sourceLang} → {translationQuery.data.targetLang}
                        </p>
                      </div>
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
            onChange={(e) => onNoteChange(e.target.value)}
            className="text-sm min-h-24 resize-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !isSaving) {
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
            <Button variant="outline" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : emoji ? `Save ${emoji}` : "Save note"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
