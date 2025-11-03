import React from "react";
import { Clock, X } from "lucide-react";
import { UseQueryResult } from "@tanstack/react-query";

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

interface AnnotationsPanelProps {
  annotationsQuery: UseQueryResult<Annotation[], any>;
  onSeek: (timestampSeconds: number) => void;
  onDelete: (id: string) => void;
}

export function AnnotationsPanel({
  annotationsQuery,
  onSeek,
  onDelete,
}: AnnotationsPanelProps) {
  return (
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
              onClick={() => onSeek(ann.timestampSeconds)}
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
                    onDelete(ann.id);
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
  );
}
