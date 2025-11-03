import React, { useRef, useCallback } from "react";
import { TranscriptWord } from "./TranscriptWord";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptContentProps {
  segments: TranscriptSegment[];
  activeSegIndex: number | null;
  fontFamily: "system" | "serif" | "mono";
  fontSize: number;
  showInlineTranslations: boolean;
  hoveredWord: string | null;
  translationMap: Map<string, { translatedText: string; targetLang: string; queryCount: number }>;
  onMouseDown?: () => void;
  onMouseUp?: (e?: React.MouseEvent<HTMLDivElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onWordMouseEnter: (word: string) => void;
  onWordMouseLeave: () => void;
  isSelecting: boolean;
  containerRef?: React.RefObject<HTMLDivElement>;
  segRefs?: React.MutableRefObject<Array<HTMLParagraphElement | null>>;
}

export function TranscriptContent({
  segments,
  activeSegIndex,
  fontFamily,
  fontSize,
  showInlineTranslations,
  hoveredWord,
  translationMap,
  onMouseDown,
  onMouseUp,
  onKeyDown,
  onWordMouseEnter,
  onWordMouseLeave,
  isSelecting,
  containerRef,
  segRefs,
}: TranscriptContentProps) {
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const internalSegRefs = useRef<Array<HTMLParagraphElement | null>>([]);

  const finalContainerRef = containerRef || internalContainerRef;
  const finalSegRefs = segRefs || internalSegRefs;

  // Get font family CSS string
  const getFontFamily = () => {
    if (fontFamily === "serif") {
      return "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
    } else if (fontFamily === "mono") {
      return "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    }
    return "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'";
  };

  // Get translation for a word (O(1) lookup)
  const getTranslationForWord = useCallback((word: string) => {
    if (!showInlineTranslations || translationMap.size === 0) return null;

    const cleanWord = word.toLowerCase().trim();
    let translation = translationMap.get(cleanWord);

    // If not found, try without punctuation
    if (!translation) {
      const noPunctuation = word.replace(/[.,!?;:'"()\[\]{}]/g, '').toLowerCase().trim();
      translation = translationMap.get(noPunctuation);
    }

    return translation;
  }, [translationMap, showInlineTranslations]);

  // Render text with individual word highlighting and inline translations
  const renderTextWithWords = (text: string) => {
    // Split text into words while preserving punctuation
    const words = text.split(/(\s+)/); // Preserve spaces

    return (
      <span className="inline-flex flex-wrap items-start gap-x-1">
        {words.map((word, idx) => {
          const isHovered = hoveredWord === word && word.trim().length > 0;
          const translation = getTranslationForWord(word);
          const hasTranslation = !!translation;

          return (
            <TranscriptWord
              key={idx}
              word={word}
              isHovered={isHovered}
              hasTranslation={hasTranslation}
              translation={translation}
              showInlineTranslations={showInlineTranslations}
              onMouseEnter={() => word.trim() && onWordMouseEnter(word)}
              onMouseLeave={onWordMouseLeave}
            />
          );
        })}
      </span>
    );
  };

  return (
    <>
      <style>
        {`
          .transcript-text::selection {
            background-color: rgba(59, 130, 246, 0.3);
            color: inherit;
          }
        `}
      </style>

      <div className="relative">
        <div
          className="relative p-6 rounded-lg border bg-gradient-to-br from-background to-muted/20 h-[150px] flex items-end justify-center overflow-hidden shadow-sm"
          ref={finalContainerRef}
          onMouseDown={segments.length > 0 ? onMouseDown : undefined}
          onMouseUp={segments.length > 0 ? onMouseUp : undefined}
          onKeyDown={segments.length > 0 ? onKeyDown : undefined}
          tabIndex={segments.length > 0 ? 0 : undefined}
          style={{
            userSelect: segments.length > 0 ? "text" : "none",
            cursor: isSelecting ? "text" : "default",
          }}
        >
          <div className="w-full text-center space-y-1 pb-4">
            {/* Show previous 2 lines in faded color for context */}
            {activeSegIndex !== null && activeSegIndex > 1 && segments[activeSegIndex - 2] && (
              <div
                className="text-foreground/30 cursor-text px-4 transcript-text"
                style={{
                  fontFamily: getFontFamily(),
                  fontSize: `${fontSize - 2}px`,
                  lineHeight: showInlineTranslations ? '1.8' : '1.5',
                  minHeight: showInlineTranslations ? '2em' : 'auto',
                }}
              >
                {renderTextWithWords(segments[activeSegIndex - 2].text)}
              </div>
            )}
            {/* Show previous line in lighter color */}
            {activeSegIndex !== null && activeSegIndex > 0 && segments[activeSegIndex - 1] && (
              <div
                className="text-foreground/50 cursor-text px-4 transcript-text"
                style={{
                  fontFamily: getFontFamily(),
                  fontSize: `${fontSize - 1}px`,
                  lineHeight: showInlineTranslations ? '1.8' : '1.5',
                  minHeight: showInlineTranslations ? '2em' : 'auto',
                }}
              >
                {renderTextWithWords(segments[activeSegIndex - 1].text)}
              </div>
            )}
            {/* Show current line (active) */}
            {activeSegIndex !== null && segments[activeSegIndex] && (
              <div
                ref={(el) => (finalSegRefs.current[activeSegIndex] = el as any)}
                className="text-foreground font-semibold cursor-text px-4 leading-relaxed transcript-text"
                style={{
                  fontFamily: getFontFamily(),
                  fontSize: `${fontSize}px`,
                  lineHeight: showInlineTranslations ? '1.9' : '1.6',
                  minHeight: showInlineTranslations ? '2.2em' : 'auto',
                }}
                data-start={segments[activeSegIndex].start}
                data-end={segments[activeSegIndex].end}
              >
                {renderTextWithWords(segments[activeSegIndex].text)}
              </div>
            )}
          </div>
          <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background to-transparent pointer-events-none rounded-t-lg" />
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none rounded-b-lg" />
        </div>
      </div>
    </>
  );
}

