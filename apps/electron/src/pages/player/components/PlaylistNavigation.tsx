import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, List } from "lucide-react";

interface PlaylistNavigationProps {
  playlistTitle?: string;
  currentIndex: number;
  totalVideos: number;
  hasNext: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
}

export function PlaylistNavigation({
  playlistTitle,
  currentIndex,
  totalVideos,
  hasNext,
  hasPrevious,
  onNext,
  onPrevious,
}: PlaylistNavigationProps): React.JSX.Element {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Playlist info */}
          <div className="flex min-w-0 items-center gap-2">
            <List className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-muted-foreground">
                {playlistTitle || "Playlist"}
              </div>
              <div className="text-xs text-muted-foreground">
                Video {currentIndex + 1} of {totalVideos}
              </div>
            </div>
          </div>

          {/* Navigation buttons */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onPrevious}
              disabled={!hasPrevious}
              title="Previous video"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onNext}
              disabled={!hasNext}
              title="Next video"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
