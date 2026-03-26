import type {
  RemoteChannel,
  RemoteMyList,
  RemotePlaylist,
  RemoteVideoWithStatus,
} from "../types";
import { api } from "./api";
import { cacheThumbnail } from "./thumbnailCache";
import {
  buildCachedPlaylistId,
  getAllSavedPlaylistsWithProgress,
  getSavedPlaylistById,
  mergeBrowseCachePlaylistItems,
  upsertBrowseCachePlaylist,
  type BrowseCachePlaylistKind,
  type PlaylistVideoInfo,
} from "../db/repositories/playlists";
import * as videoRepo from "../db/repositories/videos";

export function resolveRemoteAssetUrl(
  serverUrl: string | null,
  assetUrl?: string | null
): string | null {
  const trimmed = assetUrl?.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (!serverUrl) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return `${serverUrl}${trimmed}`;
  }

  return `${serverUrl}/${trimmed}`;
}

function getBrowseOrderTimestamp(startedAt: number, index: number): number {
  return Math.max(0, startedAt - index);
}

function stripCachedPlaylistPrefix(
  kind: BrowseCachePlaylistKind,
  playlistId: string
): string {
  const prefix = `${kind}_`;
  return playlistId.startsWith(prefix) ? playlistId.slice(prefix.length) : playlistId;
}

async function getCachedThumbnailUrl(input: {
  serverUrl: string;
  remoteUrl?: string | null;
  fallbackUrl?: string | null;
  existingUrl?: string | null;
  cacheKey: string;
}) {
  const remoteUrl =
    resolveRemoteAssetUrl(input.serverUrl, input.remoteUrl) ??
    resolveRemoteAssetUrl(input.serverUrl, input.fallbackUrl) ??
    null;
  if (input.existingUrl?.startsWith("data:")) {
    return input.existingUrl;
  }
  if (!remoteUrl) {
    return input.existingUrl ?? null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(remoteUrl) && !/^https?:/i.test(remoteUrl)) {
    return remoteUrl;
  }

  const cachedUrl = await cacheThumbnail(remoteUrl, input.cacheKey);

  return cachedUrl ?? input.existingUrl ?? remoteUrl;
}

async function normalizeRemoteVideo(
  serverUrl: string,
  video: RemoteVideoWithStatus,
  cacheKey: string
): Promise<RemoteVideoWithStatus> {
  const existingVideo = videoRepo.getVideoById(video.id);
  const normalizedThumbnailUrl = await getCachedThumbnailUrl({
    serverUrl,
    remoteUrl: video.thumbnailUrl,
    fallbackUrl: api.getThumbnailUrl(serverUrl, video.id),
    existingUrl: existingVideo?.thumbnailUrl ?? null,
    cacheKey,
  });

  videoRepo.upsertVideo({
    id: video.id,
    title: video.title,
    channelTitle: video.channelTitle,
    duration: video.duration,
    thumbnailUrl: normalizedThumbnailUrl ?? null,
    localPath: existingVideo?.localPath ?? null,
  });

  return {
    ...video,
    thumbnailUrl: normalizedThumbnailUrl,
  };
}

function toPlaylistItemVideoInfo(video: RemoteVideoWithStatus): PlaylistVideoInfo {
  return {
    videoId: video.id,
    title: video.title,
    channelTitle: video.channelTitle,
    duration: video.duration,
    thumbnailUrl: video.thumbnailUrl ?? null,
  };
}

export async function cacheRemoteChannels(
  serverUrl: string,
  channels: RemoteChannel[]
): Promise<RemoteChannel[]> {
  const startedAt = Date.now();

  return Promise.all(
    channels.map(async (channel, index) => {
      const playlistId = buildCachedPlaylistId("channel", channel.channelId);
      const existingPlaylist = getSavedPlaylistById(playlistId, {
        includeUnpinned: true,
      });
      const thumbnailUrl = await getCachedThumbnailUrl({
        serverUrl,
        remoteUrl: channel.thumbnailUrl,
        existingUrl: existingPlaylist?.thumbnailUrl ?? null,
        cacheKey: `channel-${channel.channelId}`,
      });

      upsertBrowseCachePlaylist({
        playlistId,
        title: channel.channelTitle,
        type: "channel",
        sourceId: channel.channelId,
        thumbnailUrl,
        itemCount: channel.videoCount,
        savedAt: getBrowseOrderTimestamp(startedAt, index),
      });

      return {
        ...channel,
        thumbnailUrl,
      };
    })
  );
}

export async function cacheRemotePlaylists(
  serverUrl: string,
  playlists: RemotePlaylist[]
): Promise<RemotePlaylist[]> {
  const startedAt = Date.now();

  return Promise.all(
    playlists.map(async (playlist, index) => {
      const playlistId = buildCachedPlaylistId("playlist", playlist.playlistId);
      const existingPlaylist = getSavedPlaylistById(playlistId, {
        includeUnpinned: true,
      });
      const thumbnailUrl = await getCachedThumbnailUrl({
        serverUrl,
        remoteUrl: playlist.thumbnailUrl,
        fallbackUrl: api.getPlaylistThumbnailUrl(serverUrl, playlist.playlistId),
        existingUrl: existingPlaylist?.thumbnailUrl ?? null,
        cacheKey: `playlist-${playlist.playlistId}`,
      });

      upsertBrowseCachePlaylist({
        playlistId,
        title: playlist.title,
        type: "playlist",
        sourceId: playlist.channelId,
        thumbnailUrl,
        itemCount: playlist.itemCount,
        savedAt: getBrowseOrderTimestamp(startedAt, index),
      });

      return {
        ...playlist,
        thumbnailUrl,
      };
    })
  );
}

export async function cacheRemoteMyLists(
  serverUrl: string,
  myLists: RemoteMyList[]
): Promise<RemoteMyList[]> {
  const startedAt = Date.now();

  return Promise.all(
    myLists.map(async (myList, index) => {
      const playlistId = buildCachedPlaylistId("mylist", myList.id);
      const existingPlaylist = getSavedPlaylistById(playlistId, {
        includeUnpinned: true,
      });
      const thumbnailUrl = await getCachedThumbnailUrl({
        serverUrl,
        remoteUrl: myList.thumbnailUrl,
        existingUrl: existingPlaylist?.thumbnailUrl ?? null,
        cacheKey: `mylist-${myList.id}`,
      });

      upsertBrowseCachePlaylist({
        playlistId,
        title: myList.name,
        type: "mylist",
        sourceId: myList.id,
        thumbnailUrl,
        itemCount: myList.itemCount,
        savedAt: getBrowseOrderTimestamp(startedAt, index),
      });

      return {
        ...myList,
        thumbnailUrl,
      };
    })
  );
}

export async function cacheRemoteCollectionVideos(
  serverUrl: string,
  input: {
    kind: BrowseCachePlaylistKind;
    id: string;
    title: string;
    sourceId?: string | null;
    thumbnailUrl?: string | null;
    thumbnailFallbackUrl?: string | null;
    itemCount?: number | null;
    videos: RemoteVideoWithStatus[];
  }
): Promise<RemoteVideoWithStatus[]> {
  const playlistId = buildCachedPlaylistId(input.kind, input.id);
  const existingPlaylist = getSavedPlaylistById(playlistId, {
    includeUnpinned: true,
  });
  const normalizedCollectionThumbnailUrl = await getCachedThumbnailUrl({
    serverUrl,
    remoteUrl: input.thumbnailUrl,
    fallbackUrl: input.thumbnailFallbackUrl,
    existingUrl: existingPlaylist?.thumbnailUrl ?? null,
    cacheKey: `${input.kind}-${input.id}`,
  });

  upsertBrowseCachePlaylist({
    playlistId,
    title: input.title,
    type: input.kind,
    sourceId: input.sourceId ?? (input.kind === "playlist" ? null : input.id),
    thumbnailUrl: normalizedCollectionThumbnailUrl,
    itemCount: input.itemCount ?? input.videos.length,
  });

  const normalizedVideos = await Promise.all(
    input.videos.map((video) =>
      normalizeRemoteVideo(
        serverUrl,
        video,
        `${input.kind}-${input.id}-${video.id}`
      )
    )
  );

  mergeBrowseCachePlaylistItems(
    playlistId,
    normalizedVideos.map(toPlaylistItemVideoInfo)
  );

  return normalizedVideos;
}

export function getCachedChannels(): RemoteChannel[] {
  return getAllSavedPlaylistsWithProgress({ includeUnpinned: true })
    .filter((playlist) => playlist.type === "channel")
    .map((playlist) => ({
      channelId:
        playlist.sourceId ?? stripCachedPlaylistPrefix("channel", playlist.id),
      channelTitle: playlist.title,
      thumbnailUrl: playlist.thumbnailUrl ?? null,
      videoCount: playlist.totalCount,
      lastUpdatedAt: null,
    }));
}

export function getCachedPlaylists(): RemotePlaylist[] {
  return getAllSavedPlaylistsWithProgress({ includeUnpinned: true })
    .filter((playlist) => playlist.type === "playlist")
    .map((playlist) => ({
      playlistId: stripCachedPlaylistPrefix("playlist", playlist.id),
      title: playlist.title,
      thumbnailUrl: playlist.thumbnailUrl ?? null,
      itemCount: playlist.totalCount,
      channelId: playlist.sourceId ?? null,
      type: "custom",
      downloadedCount: playlist.downloadedCount,
    }));
}

export function getCachedMyLists(): RemoteMyList[] {
  return getAllSavedPlaylistsWithProgress({ includeUnpinned: true })
    .filter((playlist) => playlist.type === "mylist")
    .map((playlist) => ({
      id: playlist.sourceId ?? stripCachedPlaylistPrefix("mylist", playlist.id),
      name: playlist.title,
      itemCount: playlist.totalCount,
      thumbnailUrl: playlist.thumbnailUrl ?? null,
      sourceType: "custom_playlist",
      sourceId: playlist.sourceId ?? stripCachedPlaylistPrefix("mylist", playlist.id),
      isFavorite: false,
    }));
}
