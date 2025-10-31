import React from "react";
import { Clock } from "lucide-react";
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

interface AnnotationFormProps {
  open: boolean;
  currentTime: number;
  selectedText: string;
  note: string;
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
  onNoteChange,
  onSave,
  onCancel,
  isSaving,
}: AnnotationFormProps) {
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
