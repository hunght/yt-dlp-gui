import { atomWithStorage } from "jotai/utils";

// Transcript settings atoms with localStorage persistence
export const fontFamilyAtom = atomWithStorage<"system" | "serif" | "mono">(
  "transcript-font-family",
  "system"
);

export const fontSizeAtom = atomWithStorage<number>(
  "transcript-font-size",
  14
);

export const translationTargetLangAtom = atomWithStorage<string>(
  "transcript-translation-target-lang",
  "vi"
);

export const includeTranslationInNoteAtom = atomWithStorage<boolean>(
  "transcript-include-translation-in-note",
  true
);

export const showInlineTranslationsAtom = atomWithStorage<boolean>(
  "transcript-show-inline-translations",
  false
);

