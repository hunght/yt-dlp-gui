import { atom } from "jotai";

// Atom for triggering annotation form from other components
export const openAnnotationFormAtom = atom<{
  trigger: number; // Increment to trigger form
  selectedText?: string; // Optional pre-filled text
  currentTime?: number; // Optional pre-filled timestamp
} | null>(null);
