import React from "react";
import { X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface AnnotationFormProps {
  currentTime: number;
  selectedText: string;
  note: string;
  onNoteChange: (note: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function AnnotationForm({
  currentTime,
  selectedText,
  note,
  onNoteChange,
  onSave,
  onCancel,
  isSaving,
}: AnnotationFormProps) {
  return (
    <div className="p-4 rounded-lg border bg-gradient-to-br from-muted/40 to-muted/20 shadow-md space-y-3 transition-all duration-200 animate-in fade-in-0 slide-in-from-bottom-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold">
            Add note at {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}
          </p>
        </div>
        <button
          onClick={onCancel}
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
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        className="text-sm min-h-24 resize-none"
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={!note.trim() || isSaving}
        >
          {isSaving ? "Saving..." : "Save note"}
        </Button>
      </div>
    </div>
  );
}
