import * as React from "react";
import { cn } from "@/lib/utils";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import { useRightSidebar } from "@/context/rightSidebar";
import { DownloadQueueSidebar } from "@/components/DownloadQueueSidebar";
import { AnnotationsSidebar } from "@/components/AnnotationsSidebar";

export function AppRightSidebar({ className, ...props }: React.ComponentProps<"div">) {
  const { open, content, annotationsData } = useRightSidebar();

  if (!open) return null;

  return (
    <ResizablePanel
      side="right"
      defaultWidth={320}
      minWidth={250}
      maxWidth={500}
      className={cn(
        "border-l border-tracksy-gold/20 bg-white/80 backdrop-blur-sm dark:border-tracksy-gold/10 dark:bg-gray-900/80",
        className
      )}
      {...props}
    >
      <div className="flex h-full flex-col p-4">
        {content === "annotations" && annotationsData ? (
          <AnnotationsSidebar
            annotationsQuery={annotationsData.annotationsQuery}
            onSeek={annotationsData.onSeek}
            onDelete={annotationsData.onDelete}
            videoTitle={annotationsData.videoTitle}
            videoDescription={annotationsData.videoDescription}
          />
        ) : (
          <DownloadQueueSidebar />
        )}
      </div>
    </ResizablePanel>
  );
}

