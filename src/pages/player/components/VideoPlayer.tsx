import React, { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { logger } from "@/helpers/logger";

interface VideoPlayerProps {
  filePath: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement, Event>) => void;
  onSeek?: (direction: "forward" | "backward", amount: number) => void;
  onError?: () => void;
}

export function VideoPlayer({
  filePath,
  videoRef,
  onTimeUpdate,
  onSeek,
  onError,
}: VideoPlayerProps): React.JSX.Element {
  const normalizePath = (p: string): string => {
    if (!p) return "";
    return p.startsWith("/") ? p : `/${p}`;
  };

  const toLocalFileUrl = (p: string): string => {
    const normalized = normalizePath(p);
    const url = `local-file://${encodeURI(normalized)}`;
    if (normalized !== p) {
      logger.warn("[VideoPlayer] Normalized file path missing leading slash", {
        original: p,
        normalized,
      });
    }
    return url;
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const isSeekingRef = useRef<boolean>(false);
  const logVideoState = (label: string): void => {
    const video = videoRef.current;
    if (!video) return;
    logger.debug("[VideoPlayer]", label, {
      src: video.currentSrc,
      readyState: video.readyState,
      networkState: video.networkState,
      currentTime: video.currentTime,
      paused: video.paused,
    });
  };

  // Handle video load error
  const handleVideoError = (): void => {
    const video = videoRef.current;
    const mediaError = video?.error;
    logger.error("[VideoPlayer] video playback error", {
      src: video?.currentSrc,
      code: mediaError?.code,
      message: mediaError?.message,
      readyState: video?.readyState,
      networkState: video?.networkState,
    });
    if (onError) {
      onError();
    }
  };

  useEffect(() => {
    logVideoState(`filePath changed -> ${filePath}`);
  }, [filePath]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const events: Array<keyof HTMLMediaElementEventMap> = [
      "loadstart",
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "canplaythrough",
      "waiting",
      "stalled",
      "suspend",
      "playing",
      "pause",
      "ended",
      "error",
    ];

    const listeners = events.map((eventName) => {
      const handler = (): void => logVideoState(`event:${eventName}`);
      video.addEventListener(eventName, handler);
      return { eventName, handler };
    });

    return () => {
      listeners.forEach(({ eventName, handler }) => {
        video.removeEventListener(eventName, handler);
      });
    };
  }, [videoRef]);

  // Mouse wheel seeking
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent): void => {
      // Only handle wheel events when hovering over the video player area
      const video = videoRef.current;
      if (!video) return;

      // Throttle: Ignore wheel events if we're already seeking
      if (isSeekingRef.current) {
        e.preventDefault();
        return;
      }

      // Prevent default scrolling
      e.preventDefault();

      // Mark as seeking
      isSeekingRef.current = true;

      // Determine seek direction and amount
      const seekAmount = 5; // seconds per scroll tick
      const direction = e.deltaY < 0 ? "backward" : "forward";
      const delta = direction === "forward" ? seekAmount : -seekAmount;

      // Seek the video
      const newTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
      video.currentTime = newTime;

      // Trigger shared seek indicator
      if (onSeek) {
        onSeek(direction, seekAmount);
      }

      // Reset seeking flag after a short delay
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 200);
    };

    // Add wheel listener with passive: false to allow preventDefault
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      isSeekingRef.current = false;
    };
  }, [videoRef, onSeek]);

  // Keyboard shortcuts for seeking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const video = videoRef.current;
      if (!video) return;

      // Only handle if video player area has focus or no input is focused
      const activeElement = document.activeElement;
      if (
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      let handled = false;
      let seekAmount = 0;
      let direction: "forward" | "backward" | null = null;

      switch (e.key) {
        case "ArrowLeft":
          seekAmount = 5;
          direction = "backward";
          video.currentTime = Math.max(0, video.currentTime - seekAmount);
          handled = true;
          break;
        case "ArrowRight":
          seekAmount = 5;
          direction = "forward";
          video.currentTime = Math.min(video.duration || 0, video.currentTime + seekAmount);
          handled = true;
          break;
        case "j":
        case "J":
          seekAmount = 10;
          direction = "backward";
          video.currentTime = Math.max(0, video.currentTime - seekAmount);
          handled = true;
          break;
        case "l":
        case "L":
          seekAmount = 10;
          direction = "forward";
          video.currentTime = Math.min(video.duration || 0, video.currentTime + seekAmount);
          handled = true;
          break;
        case "k":
        case "K":
        case " ":
          // Play/Pause
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
          handled = true;
          break;
      }

      if (handled) {
        e.preventDefault();
        if (direction && onSeek) {
          onSeek(direction, seekAmount);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [videoRef, onSeek]);

  return (
    <div className="space-y-4" ref={containerRef}>
      <div className="group relative">
        <video
          ref={videoRef}
          key={filePath}
          src={toLocalFileUrl(filePath)}
          autoPlay
          controls
          className="max-h-[60vh] w-full rounded border bg-black"
          onTimeUpdate={onTimeUpdate}
          onError={handleVideoError}
        />

        {/* Keyboard Shortcuts Hint (shows on hover) */}
        <div className="pointer-events-none absolute bottom-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="space-y-1 rounded-md bg-black/70 px-3 py-2 text-xs text-white backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                <ChevronLeft className="h-3 w-3" />
              </Badge>
              <span>5s back</span>
              <Badge variant="secondary" className="ml-2 px-1 py-0 text-[10px]">
                <ChevronRight className="h-3 w-3" />
              </Badge>
              <span>5s forward</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                J
              </Badge>
              <span>10s back</span>
              <Badge variant="secondary" className="ml-2 px-1 py-0 text-[10px]">
                L
              </Badge>
              <span>10s forward</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                K/Space
              </Badge>
              <span>Play/Pause</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                Scroll
              </Badge>
              <span>Seek ±5s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
