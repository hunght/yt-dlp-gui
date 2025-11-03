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
}: TranscriptWordProps) {
  // Don't wrap whitespace - just render as space
  if (/^\s+$/.test(word)) {
    return <span className="w-1" />;
  }

  return (
    <span
      className={`inline-flex flex-col items-center transition-all duration-100 ${
        isHovered
          ? 'bg-yellow-200 dark:bg-yellow-500/30 px-1 -mx-0.5 rounded scale-105'
          : hasTranslation
          ? 'hover:bg-blue-100 dark:hover:bg-blue-900/30 px-1 -mx-0.5 rounded'
          : 'hover:bg-muted/50 px-1 -mx-0.5 rounded'
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        cursor: word.trim() ? 'pointer' : 'default',
        minHeight: showInlineTranslations && hasTranslation ? '1.8em' : 'auto'
      }}
    >
      <span className={hasTranslation && !isHovered ? 'text-blue-600 dark:text-blue-400 font-medium' : ''}>
        {word}
      </span>
      {hasTranslation && showInlineTranslations && translation && (
        <span className="text-[10px] text-blue-500 dark:text-blue-400 leading-none whitespace-nowrap opacity-90">
          {translation.translatedText}
        </span>
      )}
    </span>
  );
}

