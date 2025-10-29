import React from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Play } from "lucide-react";

interface ThumbnailProps {
  thumbnailPath?: string | null;
  alt: string;
  className?: string;
  fallbackIcon?: React.ReactNode;
}

export default function Thumbnail({
  thumbnailPath,
  alt,
  className = "aspect-video w-full rounded-t-lg object-cover",
  fallbackIcon = <Play className="h-12 w-12 text-gray-400" />,
}: ThumbnailProps) {
  // Add logging for debugging
  console.log("Thumbnail component props:", {
    thumbnailPath,
    alt,
    className,
  });

  // Use tRPC to convert local image to data URL with caching and loading states
  const {
    data: thumbnailDataUrl,
    isLoading: isThumbnailLoading,
    error: thumbnailError,
  } = useQuery({
    queryKey: ["thumbnail", thumbnailPath],
    queryFn: async () => {
      if (!thumbnailPath) {
        console.log("No thumbnailPath provided, returning null");
        return null;
      }

      console.log("Converting thumbnail to data URL:", thumbnailPath);
      const result = await trpcClient.download.convertImageToDataUrl.query({
        imagePath: thumbnailPath,
      });
      console.log("Thumbnail conversion result:", result ? "Success" : "Failed");
      return result;
    },
    enabled: !!thumbnailPath,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });

  console.log("Thumbnail query state:", {
    thumbnailDataUrl: thumbnailDataUrl ? "Present" : "Missing",
    isThumbnailLoading,
    thumbnailError: thumbnailError?.message || "None",
  });

  // Only use local thumbnail or fallback
  const hasLocalThumbnail = thumbnailDataUrl && !thumbnailError;

  console.log("Thumbnail render decision:", {
    hasLocalThumbnail,
    isThumbnailLoading,
    willShowFallback: !hasLocalThumbnail && !isThumbnailLoading,
  });

  if (hasLocalThumbnail) {
    return (
      <img
        src={thumbnailDataUrl}
        alt={alt}
        className={className}
        onError={(e) => {
          console.error("Failed to load local thumbnail image");
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }

  // Fallback when no thumbnail is available or loading
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
