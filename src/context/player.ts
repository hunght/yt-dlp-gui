import { atom } from "jotai";

// Video element reference - shared across components
export const videoRefAtom = atom<React.RefObject<HTMLVideoElement> | null>(null);

// Current playback time in seconds
export const currentTimeAtom = atom<number>(0);

// File path of the current video
export const filePathAtom = atom<string | null>(null);

// Playback data from the API
type PlaybackData = {
  filePath?: string | null;
  title?: string;
  description?: string | null;
  videoId?: string;
  status?: string | null;
  progress?: number | null;
  lastPositionSeconds?: number;
  availableLanguages?: Array<{
    lang: string;
    hasManual: boolean;
    hasAuto: boolean;
    manualFormats?: string[];
    autoFormats?: string[];
  }>;
} & Record<string, unknown>;

export const playbackDataAtom = atom<PlaybackData | null>(null);

// Seek indicator state - shared between VideoPlayer and TranscriptPanel
export const seekIndicatorAtom = atom<{
  direction: "forward" | "backward";
  amount: number;
} | null>(null);

// Track if video is currently playing (to preserve state when switching between video elements)
export const isPlayingAtom = atom<boolean>(false);
