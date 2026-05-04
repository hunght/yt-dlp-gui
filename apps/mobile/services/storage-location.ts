import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as FileSystemLegacy from "expo-file-system/legacy";

const STORAGE_KEY = "learnify.videoStorage.v1";
const USB_LABEL_HINTS = ["usb", "drive", "external", "storage"];

export type VideoStorageLocation = {
  kind: "internal" | "saf";
  directoryUri: string | null;
  label: string;
};

export const INTERNAL_VIDEO_STORAGE: VideoStorageLocation = {
  kind: "internal",
  directoryUri: null,
  label: "Internal app storage",
};

function getStorageAccessFramework() {
  return FileSystemLegacy.StorageAccessFramework;
}

function looksLikeUsbUri(uri: string): boolean {
  const lower = decodeURIComponent(uri).toLowerCase();
  return USB_LABEL_HINTS.some((hint) => lower.includes(hint));
}

function labelForDirectoryUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const tail = decoded.split(/[/:]+/).filter(Boolean).pop();
  const suffix = tail ? `: ${tail}` : "";
  return `${looksLikeUsbUri(uri) ? "USB/external" : "Custom"} folder${suffix}`;
}

export async function getVideoStorageLocation(): Promise<VideoStorageLocation> {
  if (Platform.OS !== "android") return INTERNAL_VIDEO_STORAGE;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return INTERNAL_VIDEO_STORAGE;

    const parsed = JSON.parse(raw) as Partial<VideoStorageLocation>;
    if (parsed.kind === "saf" && typeof parsed.directoryUri === "string") {
      return {
        kind: "saf",
        directoryUri: parsed.directoryUri,
        label: parsed.label || labelForDirectoryUri(parsed.directoryUri),
      };
    }
  } catch {
    // Fall through to internal storage if the saved setting is invalid.
  }

  return INTERNAL_VIDEO_STORAGE;
}

export async function setInternalVideoStorage(): Promise<VideoStorageLocation> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  return INTERNAL_VIDEO_STORAGE;
}

export async function selectVideoStorageDirectory(): Promise<VideoStorageLocation | null> {
  if (Platform.OS !== "android") {
    throw new Error("Custom video storage is only available on Android.");
  }

  const saf = getStorageAccessFramework();
  if (!saf?.requestDirectoryPermissionsAsync) {
    throw new Error("Android folder picker is not available on this device.");
  }

  const result = await saf.requestDirectoryPermissionsAsync();
  if (!result.granted || !result.directoryUri) return null;

  const location: VideoStorageLocation = {
    kind: "saf",
    directoryUri: result.directoryUri,
    label: labelForDirectoryUri(result.directoryUri),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(location));
  return location;
}

export async function ensureSafVideosDirectory(parentUri: string): Promise<string> {
  const saf = getStorageAccessFramework();
  if (!saf) throw new Error("Android storage access is not available.");

  const files = await saf.readDirectoryAsync(parentUri);
  const existing = files.find((uri) => {
    const decoded = decodeURIComponent(uri).toLowerCase();
    return decoded.endsWith("/videos") || decoded.includes("%2fvideos");
  });
  if (existing) return existing;

  return saf.makeDirectoryAsync(parentUri, "videos");
}

export async function createSafVideoFile(directoryUri: string, videoId: string): Promise<string> {
  const saf = getStorageAccessFramework();
  if (!saf) throw new Error("Android storage access is not available.");
  return saf.createFileAsync(directoryUri, videoId, "video/mp4");
}

export async function findSafVideoFile(directoryUri: string, videoId: string): Promise<string | null> {
  const saf = getStorageAccessFramework();
  if (!saf) return null;

  try {
    const files = await saf.readDirectoryAsync(directoryUri);
    return (
      files.find((uri) => {
        const decoded = decodeURIComponent(uri).toLowerCase();
        return decoded.endsWith(`/${videoId.toLowerCase()}.mp4`) || decoded.includes(`${videoId.toLowerCase()}.mp4`);
      }) ?? null
    );
  } catch {
    return null;
  }
}
