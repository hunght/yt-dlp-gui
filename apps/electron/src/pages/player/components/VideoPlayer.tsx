import React, { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Rewind, FastForward } from "lucide-react";

interface VideoPlayerProps {
  filePath: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement, Event>) => void;
}

export function VideoPlayer({ filePath, videoRef, onTimeUpdate }: VideoPlayerProps) {
  const toLocalFileUrl = (p: string) => `local-file://${p}`;
  const [seekIndicator, setSeekIndicator] = useState<{ direction: 'forward' | 'backward'; amount: number } | null>(null);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mouse wheel seeking
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Only handle wheel events when hovering over the video player area
      const video = videoRef.current;
      if (!video) return;

      // Prevent default scrolling
      e.preventDefault();

      // Determine seek direction and amount
      // Scroll up (negative deltaY) = backward, scroll down (positive deltaY) = forward
      const seekAmount = 5; // seconds per scroll tick
      const direction = e.deltaY < 0 ? 'backward' : 'forward';
      const delta = direction === 'forward' ? seekAmount : -seekAmount;

      // Seek the video
      const newTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
      video.currentTime = newTime;

      // Show visual feedback
      setSeekIndicator({ direction, amount: seekAmount });

      // Clear previous timeout
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }

      // Hide indicator after 800ms
      seekTimeoutRef.current = setTimeout(() => {
        setSeekIndicator(null);
      }, 800);
    };

    // Add wheel listener with passive: false to allow preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, [videoRef]);

  // Keyboard shortcuts for seeking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      // Only handle if video player area has focus or no input is focused
      const activeElement = document.activeElement;
      if (activeElement?.tagName === 'INPUT' ||
          activeElement?.tagName === 'TEXTAREA' ||
          activeElement?.getAttribute('contenteditable') === 'true') {
        return;
      }

      let handled = false;
      let seekAmount = 0;
      let direction: 'forward' | 'backward' | null = null;

      switch (e.key) {
        case 'ArrowLeft':
          seekAmount = 5;
          direction = 'backward';
          video.currentTime = Math.max(0, video.currentTime - seekAmount);
          handled = true;
          break;
        case 'ArrowRight':
          seekAmount = 5;
          direction = 'forward';
          video.currentTime = Math.min(video.duration || 0, video.currentTime + seekAmount);
          handled = true;
          break;
        case 'j':
        case 'J':
          seekAmount = 10;
          direction = 'backward';
          video.currentTime = Math.max(0, video.currentTime - seekAmount);
          handled = true;
          break;
        case 'l':
        case 'L':
          seekAmount = 10;
          direction = 'forward';
          video.currentTime = Math.min(video.duration || 0, video.currentTime + seekAmount);
          handled = true;
          break;
        case 'k':
        case 'K':
        case ' ':
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
        if (direction) {
          setSeekIndicator({ direction, amount: seekAmount });
          if (seekTimeoutRef.current) {
            clearTimeout(seekTimeoutRef.current);
          }
          seekTimeoutRef.current = setTimeout(() => {
            setSeekIndicator(null);
          }, 800);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoRef]);

  return (
    <div className="space-y-4" ref={containerRef}>
      <div className="relative group">
        <video
          ref={videoRef}
          key={filePath}
          src={toLocalFileUrl(filePath)}
          autoPlay
          controls
          className="w-full max-h-[60vh] rounded border bg-black"
          onTimeUpdate={onTimeUpdate}
        />

        {/* Seek Indicator Overlay */}
        {seekIndicator && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="bg-black/80 backdrop-blur-sm rounded-lg px-6 py-4 flex items-center gap-3 shadow-lg animate-in fade-in zoom-in-95 duration-200">
              {seekIndicator.direction === 'backward' ? (
                <>
                  <Rewind className="w-8 h-8 text-white" />
                  <div className="text-white">
                    <p className="text-2xl font-bold">-{seekIndicator.amount}s</p>
                    <p className="text-xs text-white/70">Backward</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-white text-right">
                    <p className="text-2xl font-bold">+{seekIndicator.amount}s</p>
                    <p className="text-xs text-white/70">Forward</p>
                  </div>
                  <FastForward className="w-8 h-8 text-white" />
                </>
              )}
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts Hint (shows on hover) */}
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="bg-black/70 backdrop-blur-sm rounded-md px-3 py-2 text-white text-xs space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                <ChevronLeft className="w-3 h-3" />
              </Badge>
              <span>5s back</span>
              <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-2">
                <ChevronRight className="w-3 h-3" />
              </Badge>
              <span>5s forward</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] px-1 py-0">J</Badge>
              <span>10s back</span>
              <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-2">L</Badge>
              <span>10s forward</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] px-1 py-0">K/Space</Badge>
              <span>Play/Pause</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] px-1 py-0">Scroll</Badge>
              <span>Seek ±5s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
