import React from "react";

interface TranscriptWordProps {
  word: string;
  isHovered: boolean;
  hasTranslation: boolean;
  translation?: { translatedText: string; targetLang: string; queryCount: number } | null;
  showInlineTranslations: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function TranscriptWord({
  word,
  isHovered,
  hasTranslation,
  translation,
  showInlineTranslations,
  onMouseEnter,
  onMouseLeave,
}: TranscriptWordProps): React.JSX.Element {
  // Don't wrap whitespace - just render as space
  if (/^\s+$/.test(word)) {
    return <span className="w-1" />;
  }

  return (
    <span
      className={`inline-flex flex-col items-center transition-all duration-100 ${
        isHovered
          ? "-mx-0.5 scale-105 rounded bg-yellow-200 px-1 dark:bg-yellow-500/30"
          : hasTranslation
            ? "-mx-0.5 rounded px-1 hover:bg-blue-100 dark:hover:bg-blue-900/30"
            : "-mx-0.5 rounded px-1 hover:bg-muted/50"
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        cursor: word.trim() ? "pointer" : "default",
        minHeight: showInlineTranslations && hasTranslation ? "1.8em" : "auto",
      }}
    >
      <span
        className={
          hasTranslation && !isHovered ? "font-medium text-blue-600 dark:text-blue-400" : ""
        }
      >
        {word}
      </span>
      {hasTranslation && showInlineTranslations && translation && (
        <span className="whitespace-nowrap text-[10px] leading-none text-blue-500 opacity-90 dark:text-blue-400">
          {translation.translatedText}
        </span>
      )}
    </span>
  );
}
