import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Play } from "lucide-react";

interface ThumbnailProps {
  // Absolute path to cached local image (under app userData). If provided, we'll try this first.
  thumbnailPath?: string | null;
  // Remote image URL to use as fallback when local image is missing/unreadable.
  thumbnailUrl?: string | null;
  alt: string;
  className?: string;
  fallbackIcon?: React.ReactNode;
}

export default function Thumbnail({
  thumbnailPath,
  thumbnailUrl,
  alt,
  className = "aspect-video w-full rounded-t-lg object-cover",
  fallbackIcon = <Play className="h-12 w-12 text-gray-400" />,
}: ThumbnailProps): React.JSX.Element {
  // Debug logging removed - use logger.debug if needed for specific troubleshooting

  // Use tRPC to convert local image to data URL with caching and loading states
  const {
    data: thumbnailDataUrl,
    isLoading: isThumbnailLoading,
    error: thumbnailError,
  } = useQuery({
    queryKey: ["thumbnail", thumbnailPath],
    queryFn: async () => {
      if (!thumbnailPath) {
        return null;
      }

      const result = await trpcClient.utils.convertImageToDataUrl.query({
        imagePath: thumbnailPath,
      });
      return result;
    },
    enabled: !!thumbnailPath,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });

  // Track one-time webp->jpg fallback try for remote URLs
  const [remoteSrc, setRemoteSrc] = useState<string | null | undefined>(thumbnailUrl ?? null);
  useEffect(() => setRemoteSrc(thumbnailUrl ?? null), [thumbnailUrl]);

  // Prefer local cached image when available
  const hasLocalThumbnail = !!thumbnailDataUrl && !thumbnailError;

  if (hasLocalThumbnail) {
    return (
      <img
        src={thumbnailDataUrl}
        alt={alt}
        className={className}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }

  // Next: try remote URL if provided
  if (remoteSrc && !isThumbnailLoading) {
    return (
      <img
        src={remoteSrc}
        alt={alt}
        className={className}
        onError={() => {
          // Attempt one fallback from .webp to .jpg for ytimg URLs
          if (/\.webp($|\?)/.test(remoteSrc)) {
            const fallbackUrl = remoteSrc
              .replace(/\.webp($|\?)/, ".jpg$1")
              .replace(/vi_webp/, "vi");
            if (fallbackUrl !== remoteSrc) {
              setRemoteSrc(fallbackUrl);
              return;
            }
          }
          // Final fallback: hide image by clearing src
          setRemoteSrc(null);
        }}
      />
    );
  }

  // Placeholder when nothing to show (or still loading)
  return (
    <div className={`flex items-center justify-center bg-gray-200 ${className}`}>
      {isThumbnailLoading ? (
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
      ) : (
        fallbackIcon
      )}
    </div>
  );
}
