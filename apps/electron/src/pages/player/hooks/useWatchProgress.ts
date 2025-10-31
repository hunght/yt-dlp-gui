import React from "react";
import { trpcClient } from "@/utils/trpc";

export function useWatchProgress(
  videoId: string | undefined,
  videoRef: React.RefObject<HTMLVideoElement>
) {
  const [currentTime, setCurrentTime] = React.useState(0);

  const lastTimeRef = React.useRef<number>(0);
  const accumulatedRef = React.useRef<number>(0);
  const flushTimerRef = React.useRef<any>(null);

  const handleTimeUpdate = React.useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      const el = e.currentTarget;
      const current = el.currentTime;
      setCurrentTime(current);
      const prev = lastTimeRef.current;
      if (current > prev) {
        accumulatedRef.current += current - prev;
      }
      lastTimeRef.current = current;
    },
    []
  );

  const flushProgress = React.useCallback(async () => {
    if (!videoId) return;
    const delta = Math.floor(accumulatedRef.current);
    if (delta <= 0) return;
    accumulatedRef.current = 0;
    try {
      await trpcClient.ytdlp.recordWatchProgress.mutate({
        videoId,
        deltaSeconds: delta,
        positionSeconds: Math.floor(lastTimeRef.current || 0),
      });
    } catch {}
  }, [videoId]);

  React.useEffect(() => {
    // Flush every 10 seconds
    flushTimerRef.current = setInterval(() => {
      flushProgress();
    }, 10000);
    return () => {
      clearInterval(flushTimerRef.current);
      flushProgress();
    };
  }, [flushProgress]);

  return {
    currentTime,
    handleTimeUpdate,
  };
}
