import React from "react";
import { UseQueryResult } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Clock } from "lucide-react";

interface Annotation {
  id: string;
  videoId: string;
  timestampSeconds: number;
  selectedText?: string | null;
  note: string;
  createdAt: number;
}

interface AnnotationsSidebarProps {
  annotationsQuery: UseQueryResult<Annotation[], Error>;
  onSeek: (timestampSeconds: number) => void;
  onDelete: (id: string) => void;
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

export function AnnotationsSidebar({
  annotationsQuery,
  onSeek,
  onDelete,
}: AnnotationsSidebarProps) {
  const annotations = annotationsQuery.data || [];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Notes</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {annotations.length} {annotations.length === 1 ? "note" : "notes"}
        </p>
      </div>

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
            {annotations.map((annotation) => (
              <Card key={annotation.id} className="shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSeek(annotation.timestampSeconds)}
                      className="h-auto p-1 flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                    >
                      <Clock className="w-3 h-3" />
                      {formatTimestamp(annotation.timestampSeconds)}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(annotation.id)}
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
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

