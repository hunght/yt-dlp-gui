import React from "react";
import { useAtom } from "jotai";
import { Clock, Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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

interface AnnotationFormProps {
  open: boolean;
  currentTime: number;
  selectedText: string;
  note: string;
  language?: string;
  onNoteChange: (note: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function AnnotationForm({
  open,
  currentTime,
  selectedText,
  note,
  language,
  onNoteChange,
  onSave,
  onCancel,
  isSaving,
}: AnnotationFormProps) {
  // Use atoms directly for translation settings
  const [translationTargetLang] = useAtom(translationTargetLangAtom);
  const [includeTranslationInNote, setIncludeTranslationInNote] = useAtom(includeTranslationInNoteAtom);

  // Determine source and target languages
  const sourceLang = React.useMemo(() => {
    if (!language) return undefined;
    // Extract language code (e.g., "en" from "en-US")
    return language.split("-")[0];
  }, [language]);

  const targetLang = translationTargetLang || "en"; // Use user preference or default to English

  // Auto-translate when text is selected and dialog opens
  const translationQuery = useQuery({
    queryKey: ["translate", selectedText, sourceLang, targetLang],
    queryFn: async () => {
      if (!selectedText) return null;
      return await trpcClient.utils.translateText.query({
        text: selectedText,
        sourceLang: sourceLang,
        targetLang: targetLang,
      });
    },
    enabled: !!selectedText && open, // Auto-translate when dialog opens with selected text
    staleTime: Infinity, // Cache translation results
  });

  // Track previous checkbox state
  const prevIncludeTranslationRef = React.useRef(includeTranslationInNote);

  // Auto-fill or clear translation in note based on checkbox state
  React.useEffect(() => {
    const checkboxChanged = prevIncludeTranslationRef.current !== includeTranslationInNote;
    prevIncludeTranslationRef.current = includeTranslationInNote;

    if (open && translationQuery.data?.success) {
      if (includeTranslationInNote && (checkboxChanged || !note)) {
        // Fill translation when checkbox is checked
        onNoteChange(translationQuery.data.translation);
      } else if (!includeTranslationInNote && checkboxChanged && note === translationQuery.data.translation) {
        // Clear note when checkbox is unchecked and note matches translation
        onNoteChange("");
      }
    }
  }, [translationQuery.data, includeTranslationInNote, open, note, onNoteChange]);
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
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">
                      Translation ({targetLang.toUpperCase()})
                    </p>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="include-translation"
                        checked={includeTranslationInNote}
                        onCheckedChange={(checked) => setIncludeTranslationInNote(checked === true)}
                      />
                      <Label htmlFor="include-translation" className="text-xs cursor-pointer">
                        Include in note
                      </Label>
                    </div>
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

          <Textarea
            placeholder="Write your note..."
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            className="text-sm min-h-24 resize-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !isSaving) {
                e.preventDefault();
                onSave();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
