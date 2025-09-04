import type { YoutubeVideo } from "@/api/db/schema";

// Use the proper type from schema
export type Video = YoutubeVideo;

export interface Channel {
  channelId: string | null;
  channelTitle: string | null;
  videoCount: number;
}

export interface VideoStats {
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
}

export type SortBy = "createdAt" | "publishedAt" | "title" | "viewCount" | "likeCount";
export type SortOrder = "asc" | "desc";
