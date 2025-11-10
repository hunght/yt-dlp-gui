import * as React from "react";
import { useAtom, useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  rightSidebarOpenAtom,
  rightSidebarContentAtom,
  annotationsSidebarDataAtom,
} from "@/context/rightSidebar";
import { DownloadQueueSidebar } from "@/components/DownloadQueueSidebar";
import { AnnotationsSidebar } from "@/components/AnnotationsSidebar";

export function AppRightSidebar({ className, ...props }: React.ComponentProps<"div">) {
  const [open, setOpen] = useAtom(rightSidebarOpenAtom);
  const content = useAtomValue(rightSidebarContentAtom);
  const annotationsData = useAtomValue(annotationsSidebarDataAtom);
  const isMobile = useIsMobile();

  if (!open) return null;

  const sidebarContent = (
    <div className="flex h-full flex-col p-4">
      {content === "annotations" && annotationsData ? (
        <AnnotationsSidebar
          videoId={annotationsData.videoId}
          videoRef={annotationsData.videoRef}
          videoTitle={annotationsData.videoTitle}
          videoDescription={annotationsData.videoDescription}
          currentTime={annotationsData.currentTime}
        />
      ) : (
        <DownloadQueueSidebar />
      )}
    </div>
  );

  // On mobile, show as overlay sheet
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className={cn(
            "w-[85vw] max-w-md border-l border-tracksy-gold/20 bg-white/95 p-0 backdrop-blur-sm dark:border-tracksy-gold/10 dark:bg-gray-900/95",
            className
          )}
        >
          {sidebarContent}
        </SheetContent>
      </Sheet>
    );
  }

  // On desktop, show as resizable panel
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
      {sidebarContent}
    </ResizablePanel>
  );
}
