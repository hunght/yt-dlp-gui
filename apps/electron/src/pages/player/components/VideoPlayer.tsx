import React from "react";

interface VideoPlayerProps {
  filePath: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement, Event>) => void;
}

export function VideoPlayer({ filePath, videoRef, onTimeUpdate }: VideoPlayerProps) {
  const toLocalFileUrl = (p: string) => `local-file://${p}`;

  return (
    <div className="space-y-4">
      <video
        ref={videoRef}
        key={filePath}
        src={toLocalFileUrl(filePath)}
        autoPlay
        controls
        className="w-full max-h-[60vh] rounded border bg-black"
        onTimeUpdate={onTimeUpdate}
      />
    </div>
  );
}
