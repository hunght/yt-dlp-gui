import React from "react";
import { Clock, Sparkles, ExternalLink } from "lucide-react";
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
  // Extract first word for ChatGPT explanation
  const word = React.useMemo(() => {
    if (!selectedText) return "";
    return selectedText.split(/\s+/)[0].replace(/[.,!?;:()\[\]'"\-–—]/g, "").toLowerCase();
  }, [selectedText]);

  // Prepare ChatGPT prompt
  const chatGPTPrompt = React.useMemo(() => {
    if (!word) return "";
    return `Explain the word "${word}" in a fun and easy to remember way. Include definition, examples, and memory tips.`;
  }, [word]);

  const handleOpenChatGPT = async () => {
    if (!chatGPTPrompt) return;

    // Open ChatGPT with pre-filled prompt in URL
    const chatGPTUrl = `https://chat.openai.com/?q=${encodeURIComponent(chatGPTPrompt)}`;
    try {
      await trpcClient.utils.openExternalUrl.mutate({ url: chatGPTUrl });
    } catch (e) {
      console.error("Failed to open ChatGPT:", e);
    }
  };
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
          {/* ChatGPT Explanation Option - only show if there's selected text with a word */}
          {selectedText && word && (
            <div className="p-3 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
              <div className="flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <p className="text-xs font-semibold">Need help understanding "{word}"?</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenChatGPT}
                    className="w-full"
                  >
                    <ExternalLink className="w-3 h-3 mr-2" />
                    Explain with ChatGPT
                  </Button>
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
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && note.trim() && !isSaving) {
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
            disabled={!note.trim() || isSaving}
          >
            {isSaving ? "Saving..." : "Save note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
