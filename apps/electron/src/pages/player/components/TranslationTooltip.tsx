import React from "react";
import { Loader2, BookmarkPlus, Check } from "lucide-react";

interface TranslationTooltipProps {
  word: string;
  translation: string;
  translationId: string;
  loading: boolean;
  saved?: boolean;
  isSaving: boolean;
  onSave: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function TranslationTooltip({
  word,
  translation,
  loading,
  saved,
  isSaving,
  onSave,
  onMouseEnter,
  onMouseLeave,
}: TranslationTooltipProps): React.JSX.Element {
  return (
    <div
      className="pointer-events-auto absolute bottom-4 left-1/2 z-50 -translate-x-1/2 transform duration-200 animate-in fade-in slide-in-from-bottom-2"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="max-w-sm rounded-lg border border-blue-400 bg-blue-600 px-4 py-3 text-white shadow-xl dark:border-blue-600 dark:bg-blue-500">
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm">Translating "{word}"...</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-100 dark:text-blue-200">
                {word}
              </p>
              <p className="text-lg font-semibold">{translation}</p>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-blue-400/30 pt-1">
              {saved ? (
                <p className="flex items-center gap-1 text-xs text-blue-200 dark:text-blue-300">
                  <Check className="h-3 w-3" />
                  Saved to My Words
                </p>
              ) : (
                <button
                  onClick={onSave}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded bg-blue-700 px-3 py-1.5 text-xs text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="h-3 w-3" />
                      Save to My Words
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Tooltip arrow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full transform">
        <div className="h-0 w-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-blue-600 dark:border-t-blue-500"></div>
      </div>
    </div>
  );
}
